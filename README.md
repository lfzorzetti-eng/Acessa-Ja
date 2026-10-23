# Urban Accessibility Radar

Aplicação full-stack para reportar barreiras de acessibilidade urbana. O usuário envia uma foto e a localização; a API analisa a imagem com a **OpenAI** (visão), classifica o problema, atribui uma severidade e salva o relatório no **MongoDB Atlas**.

- **Frontend:** HTML + CSS + JavaScript (ES Modules), sem build
- **Backend:** Node.js 20.19+ + Express 5
- **Banco:** MongoDB Atlas (`mongodb`)
- **IA:** OpenAI `gpt-4o-mini` via `fetch`
- **Deploy:** Vercel (Express zero-config + `public/` no CDN)

---

## Arquitetura

```
Navegador
   │
   ├── GET /                   → public/index.html        (CDN Vercel)
   ├── GET /report.html        → public/report.html       (CDN Vercel)
   ├── GET /css/*, /js/*       → public/*                 (CDN Vercel)
   │
   └── /api/*                  → Express (uma Vercel Function)
         ├── GET  /api/issues?limit=50
         ├── GET  /api/issues/:id/image
         ├── POST /api/issues
         ├── GET  /health
         └── GET  /health/ready
```

No Vercel:

- `app.js` (com `export default app`) é detectado automaticamente e vira **uma única Vercel Function**.
- `public/**` é servido pelo CDN. O `express.static()` é ignorado em produção, mas funciona no desenvolvimento local.
- `vercel.json` é opcional e existe apenas para headers de segurança.

---

## Estrutura do projeto

```
.
├── app.js                      # cria e exporta o app Express
├── dev-server.js               # servidor local
├── package.json
├── vercel.json                 # headers de segurança (opcional)
├── .env.example
├── .gitignore
├── README.md
│
├── src/
│   ├── config.js               # leitura das variáveis de ambiente
│   ├── db.js                   # MongoClient cacheado + índice
│   ├── images.js               # validação/normalização da imagem
│   ├── vision.js               # chamada à OpenAI
│   ├── errors.js               # erros de domínio → status HTTP
│   └── routes.js               # /api/issues, /api/issues/:id/image, /health
│
└── public/
    ├── index.html              # dashboard
    ├── report.html             # formulário de report
    ├── favicon.svg
    ├── css/
    │   ├── base.css            # tokens, reset, topbar, botões, toast
    │   ├── dashboard.css       # cards, estatísticas, estados
    │   └── report.css          # formulário, localização, upload, aside
    └── js/
        ├── api.js              # fetch de /api
        ├── compress-image.js   # canvas: resize + JPEG
        ├── dashboard.js        # render da lista/estatísticas
        ├── report.js           # geolocalização, upload, submit
        └── ui.js               # toast, datas, helpers
```

---

## Requisitos

- Node.js **20.19+** (recomendado 22 ou 24)
- Uma conta no MongoDB Atlas (ou MongoDB local)
- Uma API key da OpenAI com acesso ao modelo de visão

---

## Configuração local

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha:

```env
MONGODB_URI=mongodb+srv://USUARIO:SENHA@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=urban_accessibility_radar

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

PORT=5080
```

> A porta local é **5080** porque a 5000 costuma estar ocupada pelo AirPlay no macOS.
> `PORT` é usado apenas localmente; não defina essa variável no Vercel.

### 2. Instalar e rodar

```bash
npm install
npm run dev
```

A API e o site sobem em `http://localhost:5080`.

O script `dev` usa `node --env-file-if-exists=.env`; se o `.env` não existir, o servidor sobe mesmo assim e responde `503` nas rotas que dependem de banco/IA.

### 3. Verificar

```bash
curl http://localhost:5080/health
curl http://localhost:5080/health/ready
curl http://localhost:5080/api/issues
```

---

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/issues?limit=50` | Lista os relatórios mais recentes **sem as imagens** (limite de 1 a 50) |
| `GET` | `/api/issues/{id}/image` | Retorna a imagem do relatório com cache imutável |
| `POST` | `/api/issues` | Analisa e salva um relatório |
| `GET` | `/health` | Liveness |
| `GET` | `/health/ready` | Readiness (ping no MongoDB) |

Exemplo de `POST /api/issues`:

```json
{
  "latitude": -23.5505,
  "longitude": -46.6333,
  "imageBase64": "data:image/jpeg;base64,..."
}
```

Resposta `201`:

```json
{
  "id": "uuid",
  "classification": "Broken sidewalk",
  "severity": "high",
  "description": "...",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "createdAt": "2026-10-23T16:00:00.000Z"
}
```

### Imagens

- O navegador redimensiona para no máximo **1600 px**, converte para JPEG (qualidade inicial `0.82`) e tenta ficar em até **2,5 MB**.
- O servidor aceita JPEG, PNG, WEBP ou GIF de até **3 MB** decodificados.
- A imagem é guardada como base64 no MongoDB e servida por um endpoint separado, para a listagem não carregar imagens.

### Status de erro

| Situação | Status |
|---|---|
| Falta `OPENAI_API_KEY` | `503` |
| OpenAI retorna 4xx/5xx | `502` |
| Timeout/abort da OpenAI | `504` |
| JSON inválido da OpenAI | `502` |
| Mongo indisponível | `503` |
| Validação de entrada | `400` |
| Body grande demais | `413` |

---

## Modelo no MongoDB

Collection `issues`:

```js
{
  _id: "uuid",
  classification: "Broken sidewalk",
  severity: "high",
  description: "Texto...",
  latitude: -23.5,
  longitude: -46.6,
  imageBase64: "...",
  imageContentType: "image/jpeg",
  createdAt: ISODate("2026-10-23T16:00:00Z")
}
```

- Índice: `{ createdAt: -1 }`, criado sob demanda.
- A leitura também aceita documentos antigos em PascalCase (`Classification`, `ImageBase64`, etc.), caso existam.

---

## Deploy no Vercel

1. Suba o repositório no GitHub.
2. Importe no Vercel com **Root Directory = raiz**.
3. Deixe o framework em **Express** (ou automático — o Vercel detecta o `app.js`).
4. Cadastre as variáveis em **Settings → Environment Variables** (Production e Preview):

```env
MONGODB_URI=...
MONGODB_DB=urban_accessibility_radar
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

> Não cadastre `PORT` no Vercel.

5. Faça o deploy.
6. Teste:

```bash
curl https://SEU-PROJETO.vercel.app/health
curl https://SEU-PROJETO.vercel.app/health/ready
curl https://SEU-PROJETO.vercel.app/api/issues
```

### MongoDB Atlas

- Em **Network Access**, libere `0.0.0.0/0` (funções do Vercel não têm IP fixo) ou restrinja aos IPs do provedor.
- Confirme que o usuário do banco tem permissão `readWrite` em `urban_accessibility_radar`.

### Se o Vercel não detectar o Express

Fallback:

```js
// api/index.js
export { default } from '../app.js';
```

```json
{
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
}
```

---

## Segurança

- Não versione o `.env`.
- A senha do MongoDB Atlas está no `.env` local. **Rotacione antes do deploy** e nunca versione esse arquivo.
- O produto não tem autenticação nem rate limit. Para uso público, adicione rate limit por IP (ou Vercel WAF) para proteger a cota da OpenAI.

---

## Comandos úteis

```bash
npm install       # instalar dependências
npm run dev       # servidor local em http://localhost:5080
npm start         # iniciar o servidor local (lê .env se existir)
```
