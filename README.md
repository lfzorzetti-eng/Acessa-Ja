# Urban Accessibility Radar

**Um radar colaborativo de barreiras de acessibilidade urbana.** Qualquer pessoa fotografa um problema no caminho, confirma a localização e publica um relatório. A IA analisa a imagem, descreve a barreira, classifica o tipo e atribui uma severidade. O resultado aparece em um painel público e fica disponível por API.

## Sobre o projeto

### O problema

Calçadas quebradas, rampas obstruídas, pisos táteis ausentes e caminhos bloqueados não aparecem nos mapas tradicionais. Quem usa cadeira de rodas, carrinho de bebê, bengala ou tem mobilidade reduzida muitas vezes descobre a barreira só quando chega ao local. Para prefeituras e coletivos de acessibilidade, também falta um retrato atualizado e comparável da situação das calçadas.

### A solução

O projeto transforma uma foto de rua em um dado estruturado e utilizável. Em vez de um relato livre e difícil de comparar, cada envio gera:

- uma **classificação curta** da barreira (por exemplo, `Broken sidewalk`, `Blocked curb ramp`, `Missing tactile paving` ou `Obstructed walkway`);
- uma **severidade** (`low`, `medium` ou `high`);
- uma **descrição** baseada apenas no que está visível na imagem;
- a **localização** e a **foto** do problema.

Esses dados podem alimentar mapas, aplicativos de rota, campanhas de advocacy e a priorização de reparos por órgãos públicos.

### Como funciona

1. A pessoa escolhe ou arrasta uma foto e confirma a localização.
2. O Angular otimiza a imagem no navegador e envia para a API.
3. A API usa a visão da OpenAI para classificar a barreira, gerar a descrição e atribuir a severidade.
4. O relatório é salvo no MongoDB Atlas e aparece no painel público.
5. A listagem, o envio e as imagens ficam disponíveis por API.

### Diferenciais

- **Relato em poucos segundos:** foto + localização, sem formulário longo.
- **Dados comparáveis:** classificação, severidade e descrição padronizadas pela IA.
- **Foco em barreiras reais:** o que está bloqueando o caminho, não apenas se um estabelecimento é acessível.
- **Pronto para integrar:** API REST com listagem, envio e imagem, pensada para mapas, rotas e priorização de reparos.
- **Web e responsivo:** não exige instalação de aplicativo.

### Stack

- **Frontend:** Angular 21 + Angular Material
- **Backend:** Node.js 20.19+ + Express 5
- **Banco:** MongoDB Atlas (`mongodb`)
- **IA:** OpenAI `gpt-4o-mini` via `fetch`
- **Deploy:** Vercel com Services (Angular estático + API Express)

---

## Arquitetura

```text
Navegador
   │
   ├── GET /                   → Angular (frontend/)
   ├── GET /report             → Angular (SPA)
   │
   └── /api/*                  → Express (app.js)
         ├── GET  /api/issues?limit=50
         ├── GET  /api/issues/:id/image
         ├── POST /api/issues
         ├── GET  /health
         └── GET  /health/ready
```

No Vercel:

- O serviço `web` builda o Angular em `frontend/` e serve o resultado pelo CDN.
- O serviço `api` roda o Express da raiz como uma Vercel Function.
- `/api/*`, `/health` e `/health/ready` são roteados para a API; o restante vai para o Angular, com fallback de SPA.

---

## Estrutura do projeto

```text
.
├── app.js                      # cria e exporta o app Express
├── dev-server.js               # servidor local da API
├── package.json                # backend + scripts
├── vercel.json                 # Services e rewrites
├── .env.example
├── .gitignore
├── README.md
│
├── src/
│   ├── config.js               # variáveis de ambiente
│   ├── db.js                   # MongoClient cacheado + índice
│   ├── images.js               # validação da imagem
│   ├── vision.js               # chamada à OpenAI
│   ├── errors.js               # erros de domínio → status HTTP
│   └── routes.js               # rotas da API
│
└── frontend/                   # Angular 21 + Material
    ├── angular.json
    ├── proxy.conf.json         # /api → localhost:5080
    ├── package.json
    └── src/
        ├── app/
        │   ├── core/
        │   │   ├── models/issue.model.ts
        │   │   ├── services/issue.service.ts
        │   │   └── utils/image-compression.ts
        │   └── features/
        │       ├── dashboard/
        │       └── report/
        ├── environments/environment.ts
        ├── index.html
        ├── main.ts
        └── styles.scss
```

---

## Requisitos

- Node.js **20.19+** ou **22.12+** ou **24+**
- Conta no MongoDB Atlas (ou MongoDB local)
- API key da OpenAI com acesso ao modelo de visão

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

### 2. Instalar dependências

```bash
npm install
npm --prefix frontend ci
```

### 3. Rodar em dois terminais

Terminal 1 — API:

```bash
npm run dev
```

API em `http://localhost:5080`.

Terminal 2 — Angular:

```bash
npm run dev:web
```

Angular em `http://localhost:4200`. O `proxy.conf.json` encaminha `/api` para `http://localhost:5080`, então não há CORS no dia a dia.

### 4. Verificar a API

```bash
curl http://localhost:5080/health
curl http://localhost:5080/health/ready
curl http://localhost:5080/api/issues
```

### 5. Build do Angular

```bash
npm run build:web
```

Saída em `frontend/dist/urban-accessibility-radar/browser`.

---

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/issues?limit=50` | Lista os relatórios mais recentes **sem as imagens** (padrão 50; valores são ajustados para a faixa 1–50) |
| `GET` | `/api/issues/{id}/image` | Retorna a imagem com cache imutável |
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

- O Angular redimensiona para no máximo **1600 px**, converte para JPEG (qualidade inicial `0.82`) e tenta ficar em até **2,5 MB**.
- O servidor aceita JPEG, PNG, WEBP ou GIF de até **3 MB** decodificados.
- A imagem é guardada como base64 no MongoDB e servida por endpoint separado, para a listagem não carregar imagens.

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

- Índice `{ createdAt: -1 }`, criado sob demanda.
- A leitura também aceita documentos antigos em PascalCase (`Classification`, `ImageBase64`, etc.).

---

## Deploy no Vercel

1. Suba o repositório no GitHub.
2. Importe no Vercel com **Root Directory = raiz**. O projeto precisa ser buildado no modo **Services** (beta); se o dashboard não detectar automaticamente, selecione **Framework = Services**.
3. Cadastre as variáveis em **Settings → Environment Variables** (Production e Preview):

```env
MONGODB_URI=...
MONGODB_DB=urban_accessibility_radar
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

> Não cadastre `PORT` no Vercel.

4. Faça o deploy. O `vercel.json` define dois Services:

```json
{
  "services": {
    "web": {
      "root": "frontend/",
      "framework": "angular",
      "installCommand": "npm ci",
      "buildCommand": "npm run build",
      "outputDirectory": "dist/urban-accessibility-radar/browser",
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    },
    "api": {
      "root": ".",
      "framework": "express",
      "functions": {
        "app.js": { "maxDuration": 60 }
      }
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/health", "destination": { "service": "api" } },
    { "source": "/health/ready", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

5. Teste:

```bash
curl https://SEU-PROJETO.vercel.app/health
curl https://SEU-PROJETO.vercel.app/health/ready
curl https://SEU-PROJETO.vercel.app/api/issues
```

### Timeout da análise

A função da API está configurada com `maxDuration: 60` segundos. O timeout interno da OpenAI em `src/vision.js` é de **50 segundos**, deixando margem para MongoDB e resposta.

### MongoDB Atlas

- Em **Network Access**, libere `0.0.0.0/0` (funções do Vercel não têm IP fixo) ou restrinja aos IPs do provedor.
- Confirme que o usuário do banco tem permissão `readWrite` em `urban_accessibility_radar`.

### Se os Services não estiverem disponíveis na sua conta

Fallback: use um único projeto com o build do Angular como output e funções serverless em `api/`. A configuração atual é a recomendada e mantém frontend e backend separados.

---

## Segurança

- Não versione o `.env`.
- A senha do MongoDB Atlas está no `.env` local. **Rotacione antes do deploy** e nunca versione esse arquivo.
- O produto não tem autenticação nem rate limit. Para uso público, adicione rate limit por IP (ou Vercel WAF) para proteger a cota da OpenAI.

---

## Comandos úteis

```bash
npm install             # dependências da API
npm --prefix frontend ci # dependências do Angular (lockfile)
npm run dev             # API em http://localhost:5080
npm run dev:web         # Angular em http://localhost:4200
npm run build:web       # build de produção do Angular
```

> O frontend vanilla anterior foi preservado no histórico do Git na branch `node-vanilla`; a versão atual usa Angular.
# Acessa-Ja
