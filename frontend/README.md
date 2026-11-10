# UI de validação do backend

Interface temporária, sem framework de frontend. Os arquivos estão separados por responsabilidade: `src/supabase-auth.js` trata cadastro/login/logout/recuperação, `src/api.js` chama health e perfil, `src/main.js` conecta os formulários, e `styles.css` concentra a apresentação. Substitua esta pasta quando o frontend definitivo for iniciado.

## Configurar e abrir

1. Copie `config.example.js` para `config.js` e preencha `supabaseUrl` e `supabasePublishableKey` com os dados do projeto Supabase. Use apenas a chave publishable/anon; nunca coloque uma service-role ou chave secreta no navegador.
2. Configure `backend/.env` conforme `backend/README.md` e inicie o backend em outra janela (`cd backend; npm run dev`).
3. Nesta pasta, execute `node server.mjs` e acesse `http://localhost:4173`.

O servidor de desenvolvimento encaminha `/healthz` e `/api/*` ao backend em `http://127.0.0.1:3000`. Para trocar o destino, defina `API_PROXY_TARGET` antes de iniciar o servidor. A porta da UI pode ser alterada com `FRONTEND_PORT`.

O cadastro envia `display_name` como metadado do usuário e retorna a confirmação de e-mail para a origem aberta no navegador. Se o projeto exigir confirmação, confirme a mensagem antes do login. A recuperação abre o formulário de nova senha ao voltar do link enviado por e-mail. Depois de entrar, carregue o perfil, altere os campos e salve para validar `GET` e `PATCH /api/v1/me/profile`. A sessão desta UI de validação fica somente na memória, não renova tokens automaticamente e é encerrada ao atualizar a página; entre novamente se o token expirar.

Cadastro e recuperação usam a origem aberta no navegador como redirecionamento. Adicione `http://localhost:4173` às URLs permitidas de redirecionamento do Supabase, se ainda não estiver permitido. A configuração local em `supabase/config.toml` também precisa permitir essa origem caso você use o Supabase local.

## Publicar a UI na Vercel

O projeto de frontend deve usar esta pasta como Root Directory. O `build.mjs` gera os arquivos estáticos e injeta somente as variáveis públicas `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`; a chave `service_role` nunca deve ser adicionada. O `vercel.json` encaminha `/healthz` e `/api/*` para o projeto `rpg-backend`, evitando chamadas cross-origin do navegador.

No painel do Supabase, permita o domínio do frontend nas URLs de redirecionamento para que confirmação de e-mail e recuperação de senha retornem à interface publicada.

Esta UI é um harness de validação, não o frontend definitivo.
