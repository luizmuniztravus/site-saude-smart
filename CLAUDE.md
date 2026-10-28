# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Landing page única e **estática** de planos de saúde da The Smart Corretora.
Sem build, sem Node, sem dependências, sem banco. Praticamente todo o
projeto é o `index.html` (~1300 linhas), nesta ordem: CSS em `<style>`,
marcação, e o JavaScript num único `<script>` no fim. Os marcos são os
comentários de cabeçalho (`/* ====== TOKENS ====== */`,
`<!-- ====== HERO ====== -->`); procure por eles em vez de decorar linha.

## Comandos

Não há build, lint nem testes. Para desenvolver:

```bash
python3 -m http.server 8000    # servir a pasta e abrir http://localhost:8000
```

Servir por HTTP (e não abrir o `file://`) importa porque o widget do CRM e
as fontes do Google são carregados de terceiros.

Publicação: copiar `index.html` e `imagens/` para a raiz do Apache,
guardando cópia do `index.html` anterior. O `crm-chave.js` sobe uma vez
só e fica (veja as armadilhas, no fim deste arquivo); localmente, para
exercitar o envio ao CRM, crie-o a partir do `crm-chave.exemplo.js`. `teste-widget.html` é uma página
de inspeção do formulário do CRM e **não** vai para produção.

Teste é manual, pelo navegador: enviar o formulário com dados reais e
conferir a oportunidade no funil; `?Tag=Teste&utm_source=teste` para checar
atribuição; console (F12) para o aviso `[The Smart] Formulário do CRM sem
action`, que indica que o widget mudou de formato.

## Arquitetura do fluxo de lead

O ponto central é o objeto `CONFIG` no topo do `<script>` — número de
WhatsApp, chave do CRM, GA4 e Meta Pixel. **É o único lugar que se mexe
para ligar integrações**; o resto do JS lê dele.

O caminho de um lead:

1. O visitante preenche o formulário bonito da página (`#formEstudo`),
   validado por `validar()`/`coletar()`.
2. `enviarAoCrm()` despacha para **um** de dois caminhos, nunca os dois:
   - **Caminho 1, `enviarPelaApi()`:** `XMLHttpRequest` POST em
     `app.funildevendas.com.br/api/Opportunity?IntegrationKey=…`, com o
     corpo montado por `corpoParaApi()`. Cria a oportunidade já no
     vendedor, no funil e na etapa de `CONFIG.crm.api`. O endpoint
     devolve `Access-Control-Allow-Origin: *` (conferido no servidor,
     não suposto), então a chamada do navegador passa. É XHR e não
     `fetch` só para o arquivo seguir em ES5 inteiro.
   - **Caminho 2, `enviarPeloWidget()`:** o antigo. Copia os dados para
     o formulário do widget (`#validation`), **oculto** no fim da página
     (`div #FormFunildeVendas`, fora da tela), e o submete para dentro de
     um `<iframe>` oculto — submit de formulário real, que não depende de
     CORS nem navega a página embora. Só roda quando o caminho 1 falha.
3. Em seguida abre o WhatsApp com a mensagem montada por `mensagem()`.

Duas consequências a respeitar em qualquer alteração:

- **Fail-open:** o lead nunca se perde por causa do CRM. API recusando,
  fora do ar ou demorando; widget desligado, ausente, ou sem atributo
  `action` → aviso no console e segue direto para o WhatsApp. Todo o
  envio ao CRM está dentro de `try/catch`.
- **Nunca os dois caminhos no mesmo envio**, senão o consultor recebe a
  mesma pessoa duas vezes no funil. Por isso o `ontimeout` da API chama
  `pronto` e não `falhou`: estourou o tempo, o POST pode ter chegado e
  estar sendo gravado, e repetir pelo widget duplicaria o card.
- **A API responde HTTP 200 mesmo quando recusa.** Quem diz se deu certo
  é o campo `response` do JSON (`"success"`/`"failure"`); `message` traz
  o motivo. Chave inválida, código inexistente e campo personalizado
  desconhecido vêm todos como 200.
- `CONFIG.crm.api.espera` (2,5 s) é o teto da espera antes do WhatsApp,
  e não deve subir muito: o `window.open` só passa sem bloqueio enquanto
  dura a ativação do clique, que é de poucos segundos.
- **`perfil` tem dois valores**, não três: `Eu ou minha família` e
  `Minha empresa (2 a 29 vidas)`. São chave de busca em
  `tituloParaCrm()` — mexer na string muda o título da oportunidade.
  `Adesão por entidade de classe` **saiu** junto com o produto, do
  cartão, do rodapé e do mapa de `tituloParaCrm()`; a remoção veio do
  `main` do repositório e foi seguida na reconciliação. Esse perfil já
  não chega ao CRM.
- **A qualificação viaja no título da oportunidade.** `tituloParaCrm()`
  monta `Site - Planos de Saúde · PME · 3 vidas · CEP 01310-100`, que é o
  que o consultor lê no card do funil antes de abrir. Mexer no formato
  muda o que ele vê. No caminho 2 a string vai no campo `Tag`, que o
  widget converte em título por falta de campo de observação; no caminho
  1 ela é o `titulo` de verdade. A mesma função serve aos dois.
- **Os três campos personalizados existem no CRM com estes títulos
  exatos:** `Idades`, `cep` e `Hospital que você não quer perder` — lidos
  da definição publicada do widget
  (`leads.funildevendas.com.br/Forms/Plugin/ValidWidget.asp?Widget=…`),
  não chutados. Na API eles estão em `CONFIG.crm.api.campos`, e o casamento
  é **pelo texto do título**: um título que não existe mais no CRM derruba
  a oportunidade inteira, não só aquele campo. O caminho 2 é mais tolerante
  — lá um campo que sumiu é só ignorado.
- **A API não tem campos de `utm_*`; o widget tinha.** Por isso
  `rastreio()` junta tudo numa linha só, para um campo personalizado cujo
  título fica em `CONFIG.crm.api.campos.rastreio`. Ele nasce **vazio de
  propósito**, porque esse campo ainda não foi criado no CRM e um título
  desconhecido faria a API recusar o lead inteiro. Criado o campo, é uma
  linha. A `Tag` da URL não depende disso: ela entra no título.

`acharCampo()` localiza os campos do widget por regex sobre `id`/`name`/
`placeholder`, com fallback por `type`, justamente porque o gerador do CRM
pode mudar os nomes. Não troque isso por seletores fixos.

`UTM` é um IIFE que lê `utm_*`, `Tag` e `ForceCodeChannel` da URL, mescla
com o que já estava em `sessionStorage` (`ts_rastreio`) e devolve o
acumulado — é o que faz a atribuição sobreviver à navegação interna até o
envio. Os ocultos do widget que vêm com a string literal `"null"` são
limpos antes do submit.

`medir()` é a camada única de eventos (`whatsapp_click`, `generate_lead`).
GA4 e Pixel só são injetados se os IDs em `CONFIG` estiverem preenchidos.

## Composição da página

Cada seção usa uma família de layout diferente, de propósito: hero em
divisão assimétrica, faixa de números com fios, muro de logos, três cartões
sobre uma faixa de foto, cartão partido do formulário, banda de busca centrada, citação
editorial, cartão de parceria, lista da equipe sem caixas, acordeão e
faixa de fecho. Repetir uma família em duas seções é o que faz a página
parecer template, então ao acrescentar seção escolha uma família nova.

Sobrancelhas (`.sobre`, o rótulo maiúsculo acima do título) são
**racionadas**: três na página inteira, no hero, em `#planos` e em
`#especialistas`. Uma por seção é o tique visual mais fácil de cometer.

A ordem das seções é funil: prova (operadoras) logo abaixo do hero,
objeções (FAQ) antes do pedido final (`#final`), e o fecho de menta
encostado no rodapé branco, separados por um fio. Os `id` e os rótulos
do menu não mudam: são âncora, `getElementById` e, no caso dos campos,
contrato com o CRM.

## Convenções

- Identificadores, comentários e textos em **português**; os comentários do
  `index.html` explicam o *porquê* das decisões e são parte da entrega para
  o cliente — mantenha esse tom ao editar.
- JavaScript em estilo ES5: `var`, `function`, nenhum arrow, template
  literal, `?.` ou framework. Nada de ferramenta nova sem necessidade real.
- **A corretora fala só de plano de saúde.** Seguro de vida, auto,
  residencial, empresarial e consórcio saíram da página inteira a
  pedido do cliente: uma pergunta inteira do FAQ, a frase do rodapé e
  a menção dentro do depoimento do Carlos Santos. Não reintroduza.
- Nenhuma pergunta do FAQ abre sozinha: o `open` do primeiro
  `<details>` foi removido a pedido do cliente.
- A página é de **tema claro e só**, escolha do cliente: é um site de
  saúde e a leitura precisa ser branca e arejada. Não reintroduza
  blocos escuros largos. **Não existe modo escuro**: os dois blocos
  `@media (prefers-color-scheme:dark)` foram removidos e o `:root`
  declara `color-scheme:light`, que também impede o navegador de pintar
  campos, listas, barra de rolagem e preenchimento automático no
  escuro. Sem essa linha o formulário ganha caixas pretas no meio de
  uma página branca.
- Cores, espaçamentos e tipografia saem dos custom properties em `:root`.
  Não embuta hex novo. Os tokens vêm em duas famílias: os de **marca**
  (`--verde`, `--profundo`, `--profundo-2`) são fixos nos dois modos; os
  **semânticos** (`--superficie`, `--cartao`, `--menta`, `--texto`,
  `--texto-2`, `--linha`, `--nav`, `--acento-texto`) formam o esqueleto
  claro. Hoje nenhum token troca de valor: há um tema só.
- **Não existe bloco escuro na página.** O cliente pediu a paleta mais
  clara **três** vezes seguidas; o cartão PME, o cartão da parceria e o
  rodapé já foram escuros e deixaram de ser, um de cada vez. Não
  reintroduza nenhum. `--profundo` sobrou para detalhes pequenos (fita,
  círculos de iniciais, texto dos botões verdes, placa da logo).
- **Mas não clareie mais.** Depois que o modo escuro saiu, o cliente viu
  a página clara pela primeira vez e achou lavada. A superfície saiu de
  `#FBFDFC` para `#EEF5F1`, a menta e a menta forte desceram junto, os
  fios subiram de .10/.18 para .14/.24 e `--texto-2` firmou em `#456159`.
  O desenho depende dessa diferença: o cartão branco e a faixa branca
  precisam **subir** sobre a superfície. Clarear a superfície de novo
  achata a página inteira, que foi exatamente a reclamação.
- A hierarquia agora é feita por tinta e fio, não por peso: o cartão em
  destaque usa `--menta-forte` + fio verde + fita. `--menta` é a faixa
  suave (busca de rede, fecho, painel do formulário). O rodapé é branco
  com fio em cima, e o fecho é de menta: se os dois ficarem na mesma
  cor, viram uma mancha só.
- As fotos de conteúdo são duas: `hero2.jpg` (a família na cama)
  dividindo o hero ao meio e `maos.jpg` como célula da grade de
  `#planos`. Já estiveram trocadas, uma no lugar da outra; o cliente
  pediu a inversão. A `maos.jpg` também já esteve no depoimento e no
  fecho, recusada nas duas, e já dividiu `#planos` ao meio antes de
  virar célula.
- O selo do hero (`.selo`) carrega o tempo de casa e leva o mesmo
  tratamento do cartão em destaque: `--menta-forte` e fio verde, com o
  número em corpo grande (`.selo b`) e o resto da frase em texto
  normal. Era maiúscula espaçada de 11,5px, o menor texto da tela,
  justamente no argumento mais forte da corretora.
- `#planos` tem **três cartões numa linha e uma faixa de foto
  embaixo**, em grade de três colunas; a foto ocupa as três
  (`grid-column:1/-1`). Medido: cartões 339x350, faixa 1056x330.
- **A proporção da caixa é o que define o tamanho do motivo**, e essa
  seção já errou isso duas vezes. Com a foto dividindo a seção ao meio,
  apareciam 40% da largura; como célula em pé numa grade de três
  colunas, 33%, e a mão virou um close de dedo. A foto é 3:2 e o
  `cover` amplia até preencher a altura, então **caixa alta = motivo
  grande**. Deitada acontece o contrário: a largura inteira aparece e o
  corte é no alto e embaixo, que é o que a foto tem sobrando. Se um dia
  for estreitar a faixa, saiba que a mão volta a crescer.
- `object-position:50% 62%` desce a janela até a aliança caber inteira
  sem cortar o entrelace. Testados 35/50/62/75 lado a lado: em 35% a
  aliança some, em 75% sai o alto do gesto.
- Entre 760px e 1040px a grade vira duas colunas e o **terceiro cartão
  passa a ocupar a linha inteira** (`.plano:last-of-type{grid-column:
  1/-1}`); sem isso sobra um buraco ao lado dele. Abaixo de 760px é uma
  coluna só, o span é desfeito e a faixa volta a 3:2, a proporção do
  arquivo, sem corte nenhum. A foto é o último filho no HTML, então vem
  depois dos cartões sem precisar de `order`.
- **Saiu um cartão a pedido do cliente**: "Adesão por entidade".
  Ficaram PME, Individual e familiar e Empresarial 30+. O Empresarial
  chegou a sair junto e voltou no pedido seguinte, com o texto e a
  classe `.plano-tinta` originais. O produto saiu **inteiro** da
  página na reconciliação com o `main` do repositório: cartão, link do
  rodapé, opção do formulário e entrada em `tituloParaCrm()`.
- A parede (`.muro`) tem **nove** posições em grade de **três
  colunas**, 3x3 — com quatro colunas sobravam três buracos na última
  fila. **As nove têm arquivo.** Abaixo de 760px vira duas colunas e o
  último cartão ocupa a linha inteira
  (`.muro-item:last-child{grid-column:1/-1}`), senão fica sozinho.
  Entrando operadora sem logo, existiu aqui um `.muro-item.falta` —
  cartão tracejado com o nome dela, que registra o credenciamento sem
  exibir marca de outra empresa. Saiu com a chegada da última, para
  não deixar CSS sem uso; está no histórico do git.
- **A Qualicorp não é operadora, é administradora de benefícios**:
  administra planos coletivos por adesão, e quem assume o risco é a
  Amil, a SulAmérica e as outras. No rodapé ela leva **duas** linhas,
  e é o par que conta a história certa: a descritiva ("Administradora
  de benefícios") e a tarja `ANS nº 417173`, porque administradora
  também é registrada na ANS — mas como administradora, não como
  operadora. Tirar a linha descritiva faria o 417173 passar por
  registro de operadora. Repare também que o produto "Adesão por
  entidade" saiu da página, e adesão é justamente o que ela
  administra — se um dia a seção for revista, os dois fatos conversam.
- `.muro-item img` leva `object-fit:contain`, e isso **não é enfeite**:
  a altura ali é fixa e a largura é limitada pelo `max-width:100%` da
  base, então um lockup largo (o da Bradesco) era comprimido na
  horizontal em tela estreita em vez de diminuir. Já aconteceu.
- O lockup da Bradesco é largo e baixo: na altura padrão o texto sai
  bem menor que o dos vizinhos, daí `img.b{height:46px}`. Foram
  comparadas 34/40/46/52 lado a lado na própria grade.
- **Dois logos do muro são a marca do grupo, não da operadora**, e em
  ambos o rótulo acompanha a arte: o nome escrito tem de ser o nome
  que está desenhado no logo. A Hapvida entra no lugar da NotreDame
  Intermédica, que foi absorvida, e o rótulo virou "Hapvida NotreDame
  Intermédica" no cartão, no rodapé e na `meta description`; o
  "Bradesco Seguros" entra no lugar da Bradesco Saúde, com o `alt` da
  própria arte. Foram decisões do cliente, depois de confirmado que
  nenhuma das duas operadoras tem lockup próprio publicado. O erro
  antigo não era o arquivo, era a marca de uma empresa embaixo do nome
  de outra — não separe os dois de novo.
- **No rodapé é diferente de propósito.** Lá a lista é de operadoras
  com registro na ANS, então o nome continua **"Bradesco Saúde"**, que
  é a razão social dona do registro 005711. Trocar por "Bradesco
  Seguros" ali colaria o número ao nome errado.
- O verde é o **único acento**. O âmbar não é um segundo acento: cobre
  dois usos semânticos, o aviso da ANS e as estrelas da avaliação.
- `imagens/travus-capital.png` é a arte da Travus **recolorida para
  fundo claro**: o original era dourado sobre preto inteiro, e a placa
  preta que resolvia isso foi recusada pelo cliente ("ficou estranha").
  O recorte guarda o ouro da marca, troca o branco pelo `--profundo` e
  zera o preto para transparente — por isso é PNG. O cartão da parceria
  **continua claro**: o preto e ouro do `main` não foi trazido, porque
  o cliente recusou bloco escuro três vezes. O botão da seção é
  `btn-verde` sólido, a pedido dele: é a única ação da seção, então não
  disputa com o CTA principal.
- O **registro na ANS** fica no rodapé, embaixo do nome de cada
  operadora (`.rodape-operadoras .ans`), não no muro de logos — o
  cliente pediu assim depois de ver nos dois lugares. O formato é a
  **tarja**: retângulo escuro, número em branco, fio claro por dentro
  e canto reto. É a convenção que as próprias operadoras usam (a da
  Bradesco é um retângulo preto de 133x34 com "ANS - nº 005711"), e a
  exigência legal é exibir o número, não o desenho. O canto reto é
  deliberado: o sistema de formas descreve interface, e isto é marca
  regulatória, não controle — `--r-campo` num bloco de 27px viraria
  pílula e sugeriria clique. O fundo é `--profundo`, não preto puro,
  para a tarja não ser o único preto de uma página sem preto nenhum.
  O `<li>` é `flex-direction:column`: com `inline-block` solto a
  tarja encostava ao lado dos nomes curtos.
  **Os nove têm número.** Seis vieram de documento público; Omint
  (359661), Qualicorp (417173) e Porto (000582) vieram do
  credenciamento da corretora. O da Porto é o da Porto Seguro -
  Seguro Saúde, e bate com o relatório IDSS da própria Porto; o grupo
  tem uma segunda operadora de saúde registrada, a Portomed, com
  número diferente. Trocando de produto, remeça — é identificação
  regulatória, não se deduz.
- Um sistema de formas só: interativo = pílula (`--r-pilula`),
  contêiner = `--r-caixa` (16px), campo = `--r-campo` (12px).
- Acessibilidade é explícita no markup existente (link "pular",
  `aria-expanded` no menu, `aria-invalid` nos campos, `role="status"` no
  recibo). Preserve ao mexer.

## Armadilhas conhecidas

- **São duas chaves diferentes, não uma, e moram em lugares diferentes.**
  A do widget (`XCSF72…`) está **duplicada** dentro do `index.html`, no
  `data-name` do `<script>` do widget e em `CONFIG.crm.chave`. A da API é
  um GUID e **não está no repositório**: vem de `crm-chave.js`, carregado
  por um `<script src>` logo antes do script principal, que define
  `window.CHAVE_CRM` e que `CONFIG.crm.api.chave` lê. Trocar de conta
  exige mexer nos três lugares e ainda rever os cinco códigos de
  `CONFIG.crm.api` (vendedor, funil, etapa, canal, segmento), que são por
  conta e não se deduzem.
- **`crm-chave.js` está no `.gitignore` e isso não é descuido**: o
  repositório é público, e chave commitada em repositório público é
  varrida por robô e fica no histórico mesmo depois de trocada. O modelo
  versionado é `crm-chave.exemplo.js`; o arquivo de verdade existe só no
  servidor. **Não o recrie dentro do repositório** achando que está
  faltando — faltando, a chave é vazia, a API não é chamada e o lead vai
  pelo widget, que é o comportamento desenhado.
- **No navegador a chave aparece de qualquer jeito.** Tirá-la do git
  resolve o robô e o histórico, não o visitante curioso: ela permite
  criar — e, de posse do código de uma oportunidade, editar — cards deste
  funil. É o preço de integrar sem servidor próprio, e está dito assim no
  README. Virando problema de verdade, o passo seguinte é um script no
  servidor fazendo a chamada.
- O `Forms.js` do Funil de Vendas instala um Pixel do Facebook por conta
  própria se houver Pixel configurado dentro do CRM. Preencher
  `CONFIG.metaPixel` com o mesmo ID conta `PageView` duas vezes — use um
  dos dois, nunca ambos.
- O e-mail é obrigatório no formulário da página porque o widget do CRM
  exige esse campo, não por decisão de UX.
- Se o modo escuro um dia voltar, as **sobrescritas vão no fim da folha
  de estilo**. Media query não soma especificidade: posta antes das
  regras de componente, ela perde na cascata e não vale nada. Já
  aconteceu enquanto o modo escuro existia.
- As fotos da equipe continuam **opcionais**: são `<img data-foto>` que
  o JavaScript remove no `error`, deixando as iniciais. Mexer aí precisa
  manter a ausência silenciosa, nunca uma imagem quebrada. Hoje as três
  existem: Cleiton Teixeira (`cleitonteixeira.jpeg`), Cesar Nieto
  (`cesarnieto.jpeg`) e Rodrigo Francheli (`rodrigofrancheli.jpeg`).
  **Ninguém tem cargo**: a lista é só de nomes, acompanhando a decisão
  que veio do `main` do repositório. `.pessoa p` foi removida junto.
  A foto é **empilhada sobre o nome**, não ao lado, e grande
  (`clamp(116px,13vw,152px)`): o cliente pediu rosto grande para o
  visitante reconhecer o consultor depois. Os arquivos foram refeitos
  a partir do original em ~555px, porque o enquadramento amplia e
  400px ficava mole em tela de alta densidade. A grade vira uma coluna
  só em **560px**, não antes: com a foto empilhada a célula é estreita
  e as três colunas cabem bem mais tempo.
  Os três arquivos substituem `equipe-1/2/3.jpg`, que eram as mesmas
  fotos (idênticas por SHA-256) sem compressão.
- Duas dessas fotos não são retratos de rosto: a do Cleiton é de meio
  corpo e a do Cesar é um card de marca com fundo roxo e logotipo ao
  lado. Arquivo quadrado em avatar quadrado significa que o `cover` não
  corta nada, então a pessoa sai minúscula. Daí `.pessoa-foto-rosto`,
  que amplia e desloca; os três valores (`--foto-x`, `--foto-y`,
  `--foto-zoom`) vão no `style` de cada foto porque são **medidos** no
  arquivo, não estimados: a cabeça do Cleiton ocupa 31%–60% da largura,
  e no card do Cesar o verde do logotipo começa em 59,3% — limite que a
  borda direita da janela não pode passar. Trocando o arquivo, remeça.
- No card do Cesar a cabeça vai de 24,5% a 55,1% da largura (eixo do
  rosto em 40,9%), o alto do cabelo está em 7,5% e o queixo em 48%. A
  janela de `--foto-zoom:250%` tem 40% de lado e vai de 19,2% a 59,2%
  na largura e de 10,8% a 50,8% na altura: a cabeça inteira cabe, com
  o colarinho entrando embaixo, e os olhos ficam a 43% da altura do
  avatar, a mesma altura dos outros dois da fila. A versão apertada
  anterior (315%) não cabia em altura: guardava o alto do cabelo,
  cortava o queixo e punha os olhos a 57%, que é o que fazia o rosto
  parecer jogado para um canto.
- **O zoom do Cesar é limitado pelo logotipo, não pelo gosto.** O
  cliente pediu menos zoom duas vezes (testados 315/300/290/280 e
  depois 265/250/240 lado a lado) e 250% é o chão: a borda direita da
  janela está em 59,2% e o verde do logotipo começa em 59,3%. Medido
  varrendo os pixels de dentro do círculo: em `--foto-x:-50%` (borda
  em 60,0%) o verde já aparece. Tirar mais zoom alarga a janela e só
  há folga do lado esquerdo, então a cabeça começa a sair do eixo para
  a direita — que foi justamente a queixa que originou este recorte.
- Essa regra depende de `max-width:none`. Sem ele o `img{max-width:100%}`
  da base trava a largura em 72px e a foto sai esticada em vez de
  ampliada. Já aconteceu, e é a mesma armadilha que `.recorte img` já
  resolve nos logos das operadoras.
- O hero é uma divisão real: `.hero` é um grid de duas colunas,
  `imagens/hero2.jpg` preenchendo a metade esquerda inteira até a borda
  e o texto à direita sobre degradê de menta. A célula é quase quadrada
  e a foto é deitada, então o recorte centrado tira cerca de um quarto
  das laterais e ainda segura a família inteira. Sem cartão e sem
  moldura; o cliente recusou painel contido.
- O bloco de texto do hero é alinhado à esquerda da sua metade e
  limitado a `calc(var(--container)/2)`. É isso que faz a margem direita
  bater com a das outras seções **sem usar `100vw`**, que conta a barra
  de rolagem e desalinha por alguns pixels. O título é dimensionado para
  fechar em 2 linhas nessa meia-coluna, não na largura da página.
- No celular a foto do hero vai para depois do texto por `order`, para o
  CTA continuar perto do topo.
- As imagens **já estão comprimidas** (a pasta saiu de 4,4 MB para
  420 KB carregados). Não existe ImageMagick, ffmpeg, cwebp nem PIL
  neste ambiente: a compressão foi feita pelo próprio Chrome, com
  `canvas` redimensionando em etapas (cada passo no máximo pela metade,
  porque um salto único de 5363 para 1600 borra o detalhe) e
  `toBlob('image/jpeg', .80)`. O arquivo volta para o disco por POST
  num servidor local de uma linha, guardado no diretório de rascunho da
  sessão — base64 pelo chat custaria dezenas de milhares de tokens.
  Os originais estão lá também, em `originais/`.
- Ao trocar qualquer imagem, **atualize os atributos `width`/`height`**
  do `<img>` para o tamanho real do novo arquivo. Eles reservam o
  espaço antes da imagem carregar; errados, a página salta.
- `operadora-seguros-unimed.png` ficou **sem recomprimir de propósito**:
  o encoder PNG do Chrome devolve um arquivo maior que o original.
  Medir antes de gravar. `hero1.jpg` continua órfã (842 KB) e sem
  compressão, porque não vai para a tela.
- Ícone dentro de botão usa `stroke="currentColor"`, nunca hex: assim
  acompanha a cor do botão quando o tema muda. Já houve ícone branco
  invisível em nav claro por causa disso.
- `#prova` tem três depoimentos: a citação editorial do Carlos Santos
  e, abaixo de um fio, o par `.depo-par` (João Felipe e Ricardo Melo).
  Os nomes do par ficaram um tempo como "Cliente PME" porque não
  tinham chegado: o cliente pediu que fossem **inventados** e isso foi
  recusado, já que assinar depoimento com pessoa que não existe é
  declaração falsa ao consumidor e quem responde é a corretora. Os
  nomes atuais foram informados pelo cliente. Trocando um nome, troque
  também as iniciais do `.avatar` ao lado.
- `imagens/logo-thesmart.png` é um lockup para **fundo escuro**: 64% dos
  pixels opacos são brancos e 28% são o verde da marca. Sobre a nav
  clara sobravam só os traços verdes e a logo sumia. Por isso
  `.marca img` leva placa de `--profundo` com `--r-campo` e 5px de
  respiro; o `box-sizing` global segura a placa em 38px, então a altura
  da nav não muda. Chegando a versão para fundo claro, tira-se a placa.
  Isso **não** vale para o favicon nem para a `og:image`, que aparecem
  sobre fundo do navegador e da rede social, fora do nosso controle.

O `README.md` é o manual do cliente (operação do CRM, campanhas, medição,
checklist pós-publicação) — consulte-o antes de mexer nas integrações.
