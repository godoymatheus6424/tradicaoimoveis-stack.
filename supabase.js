const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sharp = require('sharp');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Faz upload de um arquivo local para o Storage do Supabase e retorna a URL pública
 * @param {string} localFilePath - Caminho físico do arquivo no disco
 * @param {string} destinationPath - Nome final do arquivo dentro do bucket
 * @param {string} mimetype - Tipo mime do arquivo
 * @returns {Promise<string|null>} URL pública da imagem
 */
async function uploadToSupabase(localFilePath, destinationPath, mimetype) {
  if (!supabase) return null;

  try {
    let fileBuffer = fs.readFileSync(localFilePath);
    let finalContentType = mimetype;
    let finalPath = destinationPath;
    
    // Processamento Automático do Sharp para qualquer Imagem (evita SVGs que não são pixeladas)
    if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') {
      finalPath = destinationPath.replace(/\.[^/.]+$/, "") + ".webp";
      finalContentType = 'image/webp';
      
      fileBuffer = await sharp(fileBuffer)
        .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    }
    
    // Faz o upload para o bucket chamado 'fotos' usando o arquivo WebP otimizado (se for imagem)
    const { data, error } = await supabase.storage
      .from('fotos')
      .upload(finalPath, fileBuffer, {
        contentType: finalContentType,
        upsert: true
      });

    if (error) {
      console.error('Erro ao subir para o Supabase:', error);
      throw error;
    }

    const { data: publicData } = supabase.storage
      .from('fotos')
      .getPublicUrl(finalPath);

    return publicData.publicUrl;
  } catch (err) {
    console.error('Falha no uploadToSupabase:', err);
    throw err;
  }
}

/**
 * Remove arquivo do Storage do Supabase a partir da sua URL ou path
 * @param {string} pathOrUrl - A URL pública ou o path do arquivo
 */
async function deleteFromSupabase(pathOrUrl) {
  if (!supabase || !pathOrUrl) return;
  
  try {
    let pathToDelete = pathOrUrl;
    
    // Se for URL pública, recorta apenas o caminho relativo ao bucket 'fotos'
    const bucketStr = '/object/public/fotos/';
    const index = pathOrUrl.indexOf(bucketStr);
    
    if (index !== -1) {
      pathToDelete = pathOrUrl.substring(index + bucketStr.length);
    } else if (pathOrUrl.startsWith('/uploads/')) {
      // Caso seja apenas um path local antigo legado no banco, não vamos deletar do supabase
      console.log('Tentativa de excluir local, pulando supabase:', pathOrUrl);
      return;
    }

    // pathToDelete não deve começar com "/" para o remove do Supabase
    if (pathToDelete.startsWith('/')) pathToDelete = pathToDelete.substring(1);

    const { error } = await supabase.storage
      .from('fotos')
      .remove([pathToDelete]);
    
    if (error) console.error('Erro ao deletar foto do Supabase:', error);
  } catch (err) {
    console.error('Falha no deleteFromSupabase:', err);
  }
}

module.exports = {
  supabase,
  uploadToSupabase,
  deleteFromSupabase
};
