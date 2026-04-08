require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const db = require('./db');
const { uploadToSupabase } = require('./supabase');

// ======== REGRAS DE LEITURA (IGUAIS AO PAINEL) ========
function parseImovelTexto(text) {
  const r = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const tipoMap = {
    apartamento: 'apartamento', casa: 'casa', terreno: 'terreno',
    comercial: 'comercial', rural: 'rural', cobertura: 'cobertura',
    sala: 'comercial', loja: 'comercial', galpão: 'comercial',
  };
  const primeiraLinha = lines[0]?.toLowerCase().trim();
  if (primeiraLinha && tipoMap[primeiraLinha]) r.tipo = tipoMap[primeiraLinha];

  if (lines[1] && lines[1] !== lines[0]) r.titulo = lines[1];

  r.finalidade = /loca[çc][aã]o|aluguel/i.test(text) ? 'aluguel' : 'venda';

  const precoM = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (precoM) r.preco = parseFloat(precoM[1].replace(/\./g, '').replace(',', '.'));

  const dormM = text.match(/Dormit[oó]rios?\s*\((\d+)\)/i);
  if (dormM) r.quartos = parseInt(dormM[1]);

  const suiteM = text.match(/(\d+)\s+Su[ií]te/i);
  if (suiteM) r.suites = parseInt(suiteM[1]);

  const banhM = text.match(/Banheiros?\s*\((\d+)\)/i);
  if (banhM) r.banheiros = parseInt(banhM[1]);

  const vagasM = text.match(/Garagens?\s*\((\d+)\)/i);
  if (vagasM) r.vagas_garagem = parseInt(vagasM[1]);

  function extrairArea(label) {
    // Tenta m2 primeiro
    let m = text.match(new RegExp(label + '\\s*[\\r\\n]+([\\s\\d.,]+)\\s*m[²2]', 'i'));
    let unit = 'm2';
    
    if (!m) {
      // Tenta hectares
      m = text.match(new RegExp(label + '\\s*[\\r\\n]+([\\s\\d.,]+)\\s*(?:hectares?|ha)', 'i'));
      unit = 'ha';
    }

    if (!m) return { value: null, unit: 'm2' };

    const raw = m[1].trim();
    // Formato BR: "5.300,00" → remover pontos de milhar (antes de 3 dígitos), trocar vírgula por ponto
    const normalized = raw.replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
    let val = parseFloat(normalized);
    
    if (isNaN(val)) return { value: null, unit: 'm2' };
    
    // Se for hectare, converte pra m2 pro banco mas mantém o unit pra flag
    if (unit === 'ha') {
       return { value: val * 10000, unit: 'ha' };
    }
    return { value: val, unit: 'm2' };
  }

  const areaTotalObj = extrairArea('[AÁ]rea Total');
  r.area_total = areaTotalObj.value;
  r.unidade_area = areaTotalObj.unit;

  const areaConstruidaObj = extrairArea('[AÁ]rea Constru[ií]da');
  r.area_construida = areaConstruidaObj.value;

  const endM   = text.match(/Endere[çc]o:\s*(.+)/i);
  const bairroM = text.match(/Bairro:\s*(.+)/i);
  const cidadeM = text.match(/Cidade:\s*(.+)/i);

  if (endM)    r.endereco = endM[1].trim();
  if (bairroM) r.bairro   = bairroM[1].trim();
  if (cidadeM) {
    const cv = cidadeM[1].trim();
    const ce = cv.match(/^(.+?)\s*[-–]\s*([A-Z]{2})$/);
    if (ce) { r.cidade = ce[1].trim(); r.estado = ce[2].trim(); }
    else r.cidade = cv;
  }

  const descM = text.match(/Descri[çc][aã]o\s*[\r\n]+([\s\S]+?)(?:Localiza[çc][aã]o|$)/i);
  if (descM) r.descricao = descM[1].replace(/\s+/g, ' ').trim();

  return r;
}

// ======== EXTRAÇÃO DE TEXTO DO ARQUIVO ========
async function extractTextFromFile(filePath, ext) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } else if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
  } catch (err) {
    console.error(`  [!] CUIDADO: Erro ao ler documento ${path.basename(filePath)}`, err.message);
  }
  return null;
}

// ======== CONFIGURAÇÕES DE DIRETÓRIO ########
const BASE_DIR = "C:\\Users\\mathe\\OneDrive\\Desktop\\exemplo tradição\\Tradição Imóveis";

const CATEGORY_MAP = {
  'Apartamento': { slug: 'residencial', tipo: 'apartamento' },
  'Casa': { slug: 'residencial', tipo: 'casa' },
  'Fazenda': { slug: 'rural', tipo: 'rural' },
  'Galpão-Barracão': { slug: 'comercial-industrial', tipo: 'comercial' },
  'Sala-Salão': { slug: 'comercial-industrial', tipo: 'comercial' },
  'Sobrado': { slug: 'residencial', tipo: 'casa' },
  'Terreno': { slug: 'terrenos', tipo: 'terreno' }
};

// ======== MOTOR PRINCIPAL ========
async function main() {
  console.log('>>> Iniciando Robô de Importação Master <<<');

  console.log(' > Buscando ID das categorias no banco Supabase...');
  const catRes = await db.raw('SELECT id, slug FROM categorias');
  const catDict = {};
  catRes.rows.forEach(c => catDict[c.slug] = c.id);

  if (!fs.existsSync(BASE_DIR)) {
    console.error('DIRETÓRIO NÃO ENCONTRADO:', BASE_DIR);
    process.exit(1);
  }

  const mainFolders = fs.readdirSync(BASE_DIR).filter(f => fs.statSync(path.join(BASE_DIR, f)).isDirectory());

  let totalImoveis = 0;
  let totalFotos = 0;

  for (const masterFolder of mainFolders) {
    const mapInfo = CATEGORY_MAP[masterFolder];
    if (!mapInfo) {
      console.log(`\nPulando pasta desconhecida na raiz: [${masterFolder}]`);
      continue;
    }

    const catId = catDict[mapInfo.slug];
    const masterPath = path.join(BASE_DIR, masterFolder);
    const imoveisDirs = fs.readdirSync(masterPath).filter(f => fs.statSync(path.join(masterPath, f)).isDirectory());

    console.log(`\n=== PROCESSANDO CATEGORIA: ${masterFolder} (${imoveisDirs.length} encontrados) ===`);

    for (const imovelDir of imoveisDirs) {
      console.log(`\n[+] Analisando: ${imovelDir}`);
      const imovelPath = path.join(masterPath, imovelDir);
      const files = fs.readdirSync(imovelPath);
      
      let parsedData = {};

      // 1. Procurar Word ou PDF
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.pdf' || ext === '.docx') {
          console.log(`   * Encontrou arquivo base: ${file}. Lendo com IA...`);
          const extractedText = await extractTextFromFile(path.join(imovelPath, file), ext);
          if (extractedText) {
            parsedData = parseImovelTexto(extractedText);
          }
          break; // O primeiro que achar tá bom
        }
      }

      // Mixagem de dados (Se o Word não tinha a info, usamos os fallbacks)
      const tituloFinal = parsedData.titulo || imovelDir;
      const tipoFinal = parsedData.tipo || mapInfo.tipo;
      const finalidadeFinal = parsedData.finalidade || 'venda';
      const precoFinal = parsedData.preco || 0;

      // 2. Gravar Imóvel no Banco
      const resDb = await db.raw(
        `INSERT INTO imoveis (titulo, descricao, tipo, finalidade, preco, area_total, area_construida, quartos, suites, banheiros, vagas_garagem, endereco, bairro, cidade, estado, cep, categoria_id, destaque, novo, ativo, created_at, updated_at, unidade_area)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,true,NOW(),NOW(),?) RETURNING id`,
        [
          tituloFinal, parsedData.descricao || null, tipoFinal, finalidadeFinal, precoFinal,
          parsedData.area_total || null, parsedData.area_construida || null,
          parsedData.quartos || 0, parsedData.suites || 0, parsedData.banheiros || 0,
          parsedData.vagas_garagem || 0, parsedData.endereco || null, parsedData.bairro || null,
          parsedData.cidade || 'Maringá', parsedData.estado || 'PR', null, catId,
          false, false, parsedData.unidade_area || 'm2'
        ]
      );
      const imovelId = resDb.rows[0].id;
      totalImoveis++;
      console.log(`   -> Imóvel Registrado. (ID #${imovelId})`);

      // 3. Procurar as imagens e jogar pro Supabase Compressor
      let ordem = 0;
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          const filePath = path.join(imovelPath, file);
          const mimetype = mime.lookup(filePath) || 'image/jpeg';
          const destinationPath = `imoveis/${Date.now()}-${uuidv4()}-${file}`; // Usando uuid para garantir nome único no bucket

          process.stdout.write(`   * Comprimindo e Uploadeando -> ${file}... `);
          try {
            const publicUrl = await uploadToSupabase(filePath, destinationPath, mimetype);
            if (publicUrl) {
              await db.raw(
                `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem) VALUES (?,?,?,?,?)`,
                [imovelId, file, publicUrl, ordem === 0, ordem]
              );
              ordem++;
              totalFotos++;
              console.log('OK!');
            } else {
              console.log('FALHOU (Retornou nulo)');
            }
          } catch(err) {
            console.log('ERRO!');
          }
        }
      }
    }
  }

  console.log(`\n=================================================`);
  console.log(`✅ EXCELENTE!!! O PROCEDIMENTO FOI CONCLUÍDO!`);
  console.log(`✅ FORAM IMPORTADOS: ${totalImoveis} NOVOS IMÓVEIS!`);
  console.log(`✅ FORAM OTIMIZADAS: ${totalFotos} MÍDIAS INTELIGENTES!`);
  console.log(`=================================================`);
  process.exit(0);
}

// Helper func
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

main();
