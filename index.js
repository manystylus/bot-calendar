require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express'); // opcional se estiver usando Render como Web Service

// 🔹 Mini servidor opcional para manter o Render ativo
const app = express();
app.get('/', (_, res) => res.send('🤖 Bot de calendário está online!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const channelId = process.env.CHANNEL_ID;
const eventosFile = path.join(__dirname, 'eventos.json');

// 🗂️ Carrega eventos salvos
let eventos = [];
if (fs.existsSync(eventosFile)) {
  eventos = JSON.parse(fs.readFileSync(eventosFile));
}

// 💾 Salvar eventos
function salvarEventos() {
  fs.writeFileSync(eventosFile, JSON.stringify(eventos, null, 2));
}

// 📅 Gera o texto do calendário
function gerarCalendario() {
  const agora = new Date();
  const mes = agora.toLocaleString('pt-BR', { month: 'long' });
  const ano = agora.getFullYear();

  let texto = `**📅 ${mes.toUpperCase()} ${ano}**\n\n`;

  const eventosDoMes = eventos.filter(ev => {
    const data = new Date(ev.data);
    return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
  });

  if (eventosDoMes.length === 0) {
    texto += "_Sem eventos registrados neste mês._";
  } else {
    eventosDoMes.sort((a, b) => new Date(a.data) - new Date(b.data));
    for (const ev of eventosDoMes) {
      const [ano, mes, dia] = ev.data.split('-');
      const dataBR = `${dia}/${mes}/${ano}`;
      texto += `**${dataBR}** – ${ev.nome}`;
      if (ev.local || ev.hora) texto += ` (${ev.local || ''} ${ev.hora || ''})`;
      texto += '\n';
    }
  }

  return texto;
}

// 🔁 Atualiza o calendário no canal
async function atualizarCalendario() {
  const canal = await client.channels.fetch(channelId);
  const mensagens = await canal.messages.fetch({ limit: 10 });
  const msgCalendario = mensagens.find(m => m.author.id === client.user.id);

  const novoTexto = gerarCalendario();

  if (msgCalendario) {
    await msgCalendario.edit(novoTexto);
  } else {
    await canal.send(novoTexto);
  }
}

// 🕐 Envia lembretes automáticos (diariamente)
async function verificarLembretes() {
  const hojeISO = new Date().toISOString().split('T')[0];
  const eventosDeHoje = eventos.filter(ev => ev.data === hojeISO);

  if (eventosDeHoje.length > 0) {
    const canal = await client.channels.fetch(channelId);
    for (const ev of eventosDeHoje) {
      const [ano, mes, dia] = ev.data.split('-');
      const dataBR = `${dia}/${mes}/${ano}`;
      await canal.send(`📣 **Lembrete:** Hoje (${dataBR}) acontece **${ev.nome}**! ${ev.local ? `📍${ev.local}` : ''} ${ev.hora ? `🕒 ${ev.hora}` : ''}`);
    }
  }
}

// 🧭 Inicia o bot
client.once('ready', () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  atualizarCalendario();

  // verifica lembretes a cada 6h
  setInterval(verificarLembretes, 6 * 60 * 60 * 1000);
});

// 💬 Comandos
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(' ');
  const comando = args.shift().toLowerCase();

  // !ajuda
  if (comando === '!ajuda') {
    const texto = `
**🧭 COMANDOS DO BOT DE CALENDÁRIO**

📅 \`!addevento DD/MM/AAAA Nome | Local | Hora\`
Adiciona um novo evento.  
Exemplo: \`!addevento 10/11/2025 Feira Cultural da Véu | Shopping Roma | 14h\`

🗓️ \`!listeventos\`
Mostra todos os eventos futuros.

🗑️ \`!removeevento DD/MM/AAAA\`
Remove o evento dessa data.

🕐 O bot avisa automaticamente quando houver um evento no dia!
`;
    return message.reply(texto);
  }

  // !addevento
  if (comando === '!addevento') {
    if (args.length < 2) {
      return message.reply('❌ Use: `!addevento DD/MM/AAAA Nome | Local | Hora`');
    }

    const data = args.shift();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      return message.reply('⚠️ Formato de data inválido. Use: DD/MM/AAAA');
    }

    const [dia, mes, ano] = data.split('/');
    const dataISO = `${ano}-${mes}-${dia}`;

    const resto = args.join(' ').split('|').map(t => t.trim());
    const nome = resto[0];
    const local = resto[1] || '';
    const hora = resto[2] || '';

    eventos.push({ data: dataISO, nome, local, hora });
    salvarEventos();
    await atualizarCalendario();

    message.reply(`✅ Evento adicionado: **${nome}** (${data}) ${local ? `📍${local}` : ''} ${hora ? `🕒${hora}` : ''}`);
  }

  // !listeventos
  if (comando === '!listeventos') {
    if (eventos.length === 0) return message.reply('📭 Nenhum evento cadastrado ainda.');

    let texto = '**🗓️ Eventos cadastrados:**\n\n';
    eventos
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .forEach(ev => {
        const [ano, mes, dia] = ev.data.split('-');
        const dataBR = `${dia}/${mes}/${ano}`;
        texto += `📅 ${dataBR} — **${ev.nome}**`;
        if (ev.local) texto += ` | 📍${ev.local}`;
        if (ev.hora) texto += ` | 🕒${ev.hora}`;
        texto += '\n';
      });

    message.reply(texto);
  }

  // !removeevento
  if (comando === '!removeevento') {
    const data = args[0];
    if (!data) return message.reply('❌ Use: `!removeevento DD/MM/AAAA`');

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      return message.reply('⚠️ Formato de data inválido. Use: DD/MM/AAAA');
    }

    const [dia, mes, ano] = data.split('/');
    const dataISO = `${ano}-${mes}-${dia}`;

    const antes = eventos.length;
    eventos = eventos.filter(ev => ev.data !== dataISO);
    if (eventos.length === antes) {
      return message.reply('⚠️ Nenhum evento encontrado nessa data.');
    }

    salvarEventos();
    await atualizarCalendario();

    message.reply(`🗑️ Evento removido da data ${data}.`);
  }
});

client.login(process.env.TOKEN);
