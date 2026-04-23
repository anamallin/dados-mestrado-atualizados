# Projeto de Visualização de Dados de Mestrado

Site estático em HTML, CSS e JavaScript com páginas para:

- navegação principal do projeto;
- dados experimentais;
- clustering;
- análise estatística e enriquecimento;
- páginas auxiliares para dados oriundos de banco de dados.

## Página inicial

- `index.html`

## Páginas principais

- `dados-experimentais.html`
- `amostras.html`
- `matriz.html`
- `tratamento-analise-estatistica.html`
- `dados-banco-dados.html`
- `clustering-banco-dados.html`
- `analise-enriquecimento-banco-dados.html`

## Pastas de dados e imagens usadas pelo site

- `analiseeenriquecimento/`
- `clusteringbancodedados/`
- `EGSEAREPORT/`
- `enriquecimento/`
- `heatmapsgenes/`
- `string-epn-network/`
- `string-mb-network/`
- `string-pa-network/`
- `volcanoplots/`

## Arquivos de apoio importantes

- `biomarcadores-data.js`
- `matriz-dados.js`
- `egsea-manifest.json`
- `package.json`
- `package-lock.json`

## Como abrir localmente

Como várias páginas usam arquivos externos, o ideal é abrir o projeto por servidor local em vez de abrir o HTML direto no navegador.

Exemplo com Node:

```bash
npx serve .
```

Ou com Python:

```bash
python -m http.server 8000
```

Depois, abra `index.html` pelo endereço local gerado pelo servidor.

## Organização para GitHub

O projeto foi preparado para subir como site estático, mantendo os caminhos atuais dos arquivos para evitar quebra de links.

Arquivos e pastas claramente locais ou não relacionados foram colocados no `.gitignore`, como:

- `node_modules/`
- instaladores
- pastas pessoais do Windows
- capturas e arquivos temporários

## Publicação sugerida

Se for usar GitHub Pages, a opção mais simples é publicar a partir da raiz do repositório e usar `index.html` como entrada.
