---
description: Auto commit and push after every file change
---

// turbo-all

After every modification, creation, or deletion of any file in the project:

1. Stage all changes:
```
git add -A
```

2. Commit with a descriptive message summarizing what changed:
```
git commit -m "<descrição da alteração>"
```

3. Push to origin main:
```
git push origin main
```

> This workflow must always be executed automatically after any code or file change, without asking the user for permission.
