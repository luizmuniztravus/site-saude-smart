/* =====================================================================
   MODELO. Copie este arquivo para crm-chave.js, ponha a chave de
   integração do Funil de Vendas no lugar do texto abaixo e guarde-o
   junto do index.html na raiz do Apache.

       cp crm-chave.exemplo.js crm-chave.js

   O crm-chave.js está no .gitignore e NÃO deve ser commitado: este
   repositório é público, e chave em repositório público é varrida por
   robô e continua no histórico mesmo depois de trocada. No navegador
   ela aparece de qualquer jeito — é o preço de integrar um site
   estático sem servidor próprio —, mas aí é uma chave que se troca no
   CRM, não um registro permanente no GitHub.

   A chave está no CRM, em Configurações › Integrações › API.

   Sem este arquivo a página continua funcionando: a chave fica vazia,
   a API de oportunidades não é chamada e o lead segue pelo widget de
   captura e pelo WhatsApp, como antes da integração. O 404 no console
   é o único sinal.
   ===================================================================== */
var CHAVE_CRM = "cole-aqui-a-chave-de-integracao";
