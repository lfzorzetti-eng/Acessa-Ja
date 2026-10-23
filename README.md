# Urban Accessibility Radar

Aplicação full-stack para reportar barreiras de acessibilidade urbana. O usuário envia uma foto e a localização; a API analisa a imagem com a **OpenAI** (visão), classifica o problema, atribui uma severidade e salva o relatório no **MongoDB Atlas**.

- **Frontend:** Angular 21 + Angular Material
- **Backend:** ASP.NET Core 10 (minimal API)
- **Banco:** MongoDB Atlas (`MongoDB.Driver`)
- **IA:** OpenAI `gpt-4o-mini` (configurável)
- **Deploy:** Vercel (Angular estático + API .NET em container, no mesmo domínio)

---

## Arquitetura

```
Navegador
   │
   ├── GET  /                → Angular (estático no Vercel)
   ├── GET  /api/issues      → API .NET  ──→ MongoDB Atlas
   ├── GET  /api/issues/:id/image
   └── POST /api/issues      → API .NET  ──→ OpenAI (visão)
                                 │
                                 └── classificação, severidade e descrição
```

No deploy, `vercel.json` define **dois services**:

| Service | Tipo | Caminho |
|---|---|---|
| `web` | Angular estático | `frontend/` |
| `api` | Container .NET 10 | `backend/UrbanAccessibilityRadar.Api/` |

As rewrites mandam `/api/*` para a API e todo o resto para o Angular. Como tudo fica no **mesmo domínio**, não é necessário configurar CORS em produção.

---

## Estrutura do projeto

```
.
├── vercel.json                        # services web + api e rewrites
├── backend/
│   ├── .env                           # variáveis locais (NÃO versionar)
│   ├── .env.example                   # modelo de variáveis
│   └── UrbanAccessibilityRadar.Api/
│       ├── Dockerfile.vercel          # imagem usada pelo Vercel
│       ├── Program.cs                 # endpoints, Mongo, CORS, PORT
│       ├── appsettings.json           # defaults sem segredos
│       ├── Contracts/                 # CreateIssueRequest, VisionAnalysis, IssueSummary
│       ├── Data/IssueRepository.cs    # acesso ao MongoDB
│       ├── Models/Issue.cs
│       └── Services/
│           ├── VisionAnalysisService.cs
│           └── ImagePayload.cs
└── frontend/
    ├── proxy.conf.json                # dev: /api → localhost:5080
    └── src/app/
        ├── core/
        │   ├── models/issue.model.ts
        │   ├── services/issue.service.ts
        │   └── utils/image-compression.ts
        └── features/
            ├── dashboard/
            └── report/
```

---

## Requisitos

- .NET 10 SDK
- Node.js 20.19+ (recomendado 22 ou 24)
- Uma conta no MongoDB Atlas (ou MongoDB local)
- Uma API key da OpenAI com acesso ao modelo de visão

---

## Configuração local

### 1. Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` e preencha:

```env
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://localhost:5080

MongoDB__ConnectionString=mongodb+srv://USUARIO:SENHA@cluster.mongodb.net/?retryWrites=true&w=majority
MongoDB__Database=urban_accessibility_radar

AI__Provider=OpenAI
OPENAI_API_KEY=sk-...
AI__OpenAI__Model=gpt-4o-mini
```

> `backend/.env` é carregado automaticamente pela API e está no `.gitignore`.
> A porta local é **5080** (a 5000 costuma estar ocupada pelo AirPlay no macOS).

### 2. Rodar a API

```bash
dotnet run --project backend/UrbanAccessibilityRadar.Api/UrbanAccessibilityRadar.Api.csproj --launch-profile http
```

A API sobe em `http://localhost:5080`. Os endpoints de saúde são:

```bash
curl http://localhost:5080/health
curl http://localhost:5080/health/ready   # testa o MongoDB
```

### 3. Rodar o Angular

```bash
cd frontend
npm install
npm start
```

Abra `http://localhost:4200`. O dev server usa `proxy.conf.json` para encaminhar `/api` para `http://localhost:5080`, então não há CORS no dia a dia.

---

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/issues?limit=50` | Lista os relatórios mais recentes **sem as imagens** (limite máximo de 50) |
| `GET` | `/api/issues/{id}/image` | Retorna a imagem do relatório com cache |
| `POST` | `/api/issues` | Analisa e salva um relatório |
| `GET` | `/health` | Liveness |
| `GET` | `/health/ready` | Readiness (ping no MongoDB) |

Exemplo de POST:

```json
{
  "latitude": -23.5505,
  "longitude": -46.6333,
  "imageBase64": "data:image/jpeg;base64,..."
}
```

A imagem é validada no servidor (JPEG, PNG, WEBP ou GIF, até **3 MB**). No navegador, a imagem é redimensionada e recomprimida automaticamente antes do envio.

---

## Deploy no Vercel

### 1. Repositório

O Vercel faz deploy a partir do GitHub:

```bash
git init
git add .
git commit -m "Urban Accessibility Radar"
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

Confirme que `backend/.env` **não** foi commitado.

### 2. Importar no Vercel

1. **Add New Project** → importe o repositório.
2. **Root Directory:** a raiz do repositório (onde está o `vercel.json`).
3. Framework preset: deixe em branco (o `vercel.json` define os services).
4. Cadastre as variáveis de ambiente em **Settings → Environment Variables** (Production e Preview):

```env
MongoDB__ConnectionString=mongodb+srv://USUARIO:SENHA@cluster.mongodb.net/?retryWrites=true&w=majority
MongoDB__Database=urban_accessibility_radar

AI__Provider=OpenAI
OPENAI_API_KEY=sk-...
AI__OpenAI__Model=gpt-4o-mini

ASPNETCORE_ENVIRONMENT=Production
PORT=8080
```

> **`PORT=8080` é obrigatório.** O container .NET escuta em 8080, e o Vercel roteia para a porta definida em `PORT` (o padrão dele é 80, que é privilegiada).

5. Clique em **Deploy**.

### 3. MongoDB Atlas

- Em **Network Access**, libere `0.0.0.0/0` (containers do Vercel não têm IP fixo) ou restrinja aos IPs do seu provedor.
- Confirme que o usuário do banco tem permissão `readWrite` em `urban_accessibility_radar`.
- A API cria o índice de `createdAt` na inicialização; se o Atlas estiver fora no momento do deploy, ela sobe mesmo assim e o índice é criado no próximo start.

### 4. Verificação pós-deploy

```bash
curl https://SEU-PROJETO.vercel.app/health
curl https://SEU-PROJETO.vercel.app/health/ready
curl https://SEU-PROJETO.vercel.app/api/issues
```

Depois abra o site, permita a localização (HTTPS é obrigatório para geolocalização) e envie uma foto.

---

## Fallback: API fora do Vercel

Os services com container no Vercel ainda estão em **beta**. Se o build do container falhar:

1. Faça deploy da API em um host com Docker (Render, Railway, Fly.io, VPS).
2. No Vercel, mantenha apenas o service `web` e remova o `api` do `vercel.json`.
3. Crie um rewrite no projeto do frontend de `/api/(.*)` para a URL da API.
4. Se preferir chamar a API direto, defina `apiUrl` em `frontend/src/environments/environment.ts` com a URL completa e configure `Cors__AllowedOrigins` na API.

---

## Limites e decisões de produção

| Limite | Valor | Por quê |
|---|---|---|
| Corpo da requisição no Vercel | **4,5 MB** | Limite da plataforma. A imagem é comprimida no navegador para ~2,5 MB |
| Imagem aceita pela API | **3 MB** | Validação no servidor (`ImagePayload`) |
| Lista de relatórios | **50** | `GET /api/issues` retorna metadados, não imagens |
| Documento no MongoDB | 16 MB | Imagens comprimidas ficam muito abaixo disso |

- **Imagens:** o navegador redimensiona para no máximo 1600 px e converte para JPEG (~82% de qualidade).
- **Listagem:** o dashboard carrega apenas os metadados; cada imagem é baixada sob demanda em `/api/issues/{id}/image`.
- **Cold start:** o primeiro request após um período ocioso pode levar alguns segundos (container .NET + Mongo + OpenAI).

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `403 Forbidden` em `localhost:5000` | AirPlay usa a porta 5000 no macOS | Use a porta 5080 (já configurada) |
| `503 Image analysis is not configured` | `OPENAI_API_KEY` ausente | Configure a chave e reinicie a API |
| `413 FUNCTION_PAYLOAD_TOO_LARGE` | Imagem grande demais | A compressão no frontend deve manter o payload abaixo de 4,5 MB |
| `502` no envio | Falha/timeout na OpenAI | Verifique a chave, o modelo e os logs do Vercel |
| `503` no dashboard | MongoDB inacessível | Verifique a connection string e o Network Access do Atlas |
| Container 502 no Vercel | API não está escutando na porta certa | Confirme `PORT=8080` nas variáveis do projeto |

---

## Segurança

- Nunca commite `backend/.env`. Use as variáveis de ambiente do Vercel.
- A senha do MongoDB e a chave da OpenAI devem ser **rotacionadas** se tiverem sido expostas.
- A chave da OpenAI fica somente no backend; o navegador nunca a recebe.
- O checklist de deploy inclui: `.env` ignorado, Atlas com usuário de menor privilégio e `0.0.0.0/0` apenas se necessário.
