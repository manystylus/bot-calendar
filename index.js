const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('🤖 Bot de calendário está online!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor web ativo na porta ${PORT}`));
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  ApplicationCommandOptionType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- Configurações ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const channelId = process.env.CHANNEL_ID;
const token = process.env.TOKEN;
const eventosFile = path.join(__dirname, 'eventos.json');

// 🗂️ Carrega eventos
let eventos = [];
if (fs.existsSync(eventosFile)) {
  try {
    eventos = JSON.parse(fs.readFileSync(eventosFile, 'utf8'));
  } catch (err) {
    console.error('Erro ao ler eventos.json', err);
    eventos = [];
  }
}

function salvarEventos() {
  fs.writeFileSync(eventosFile, JSON.stringify(eventos, null, 2));
}

// 📅 Gera texto do calendário
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
      const data = new Date(ev.data);
      const dia = data.getDate().toString().padStart(2, '0');
      texto += `**${dia}** – ${ev.nome}`;
      if (ev.local || ev.hora) texto += ` (${ev.local || ''} ${ev.hora || ''})`;
      texto += '\n';
    }
  }

  return texto;
}

// 🔁 Atualiza calendário no canal
async function atualizarCalendario() {
  try {
    const canal = await client.channels.fetch(channelId);
    if (!canal) return console.error(`Canal ${channelId} não encontrado.`);
    const mensagens = await canal.messages.fetch({ limit: 10 });
    const msgCalendario = mensagens.find(m => m.author.id === client.user.id);
    const novoTexto = gerarCalendario();

    if (msgCalendario) {
      await msgCalendario.edit(novoTexto);
    } else {
      await canal.send(novoTexto);
    }
  } catch (error) {
    console.error('Erro ao atualizar calendário:', error);
  }
}

// 🕐 Lembretes automáticos
async function verificarLembretes() {
  const hoje = new Date().toISOString().split('T')[0];
  const eventosDeHoje = eventos.filter(ev => ev.data === hoje);

  if (eventosDeHoje.length > 0) {
    const canal = await client.channels.fetch(channelId);
    for (const ev of eventosDeHoje) {
      await canal.send(`📣 **Lembrete:** Hoje acontece **${ev.nome}**! ${ev.local ? `📍${ev.local}` : ''} ${ev.hora ? `🕒 ${ev.hora}` : ''}`);
    }
  }
}

// 📋 Slash Commands
const COMMANDS = [
  {
    name: 'ajuda',
    description: 'Mostra os comandos disponíveis.'
  },
  {
    name: 'addevento',
    description: 'Adiciona um novo evento ao calendário.',
    options: [
      {
        name: 'data',
        description: 'Data do evento (AAAA-MM-DD)',
        type: ApplicationCommandOptionType.String,
        required: true
      },
      {
        name: 'nome',
        description: 'Nome do evento',
        type: ApplicationCommandOptionType.String,
        required: true
      },
      {
        name: 'local',
        description: 'Local do evento',
        type: ApplicationCommandOptionType.String,
        required: false
      },
      {
        name: 'hora',
        description: 'Hora do evento (ex: 14h, 18:30)',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ]
  },
  {
    name: 'listeventos',
    description: 'Lista todos os eventos cadastrados.'
  },
  {
    name: 'removeevento',
    description: 'Remove um evento pela data.',
    options: [
      {
        name: 'data',
        description: 'Data do evento (AAAA-MM-DD)',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  }
];

// 🚀 Inicializa o bot
client.once('ready', async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);

  // Registra comandos
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: COMMANDS });
    console.log('✨ Comandos de barra registrados.');
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }

  atualizarCalendario();
  setInterval(verificarLembretes, 6 * 60 * 60 * 1000);
});

// 🎯 Executa Slash Commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  await interaction.deferReply({ ephemeral: false });

  try {
    if (commandName === 'ajuda') {
      const texto = `
**🧭 COMANDOS DO BOT DE CALENDÁRIO**

📅 \`/addevento\` — Adiciona um novo evento (data, nome, local, hora)
🗓️ \`/listeventos\` — Mostra todos os eventos futuros
🗑️ \`/removeevento\` — Remove o evento de uma data
🕐 O bot avisa automaticamente quando houver um evento no dia!
`;
      await interaction.editReply(texto);
    }

    if (commandName === 'addevento') {
      const data = interaction.options.getString('data');
      const nome = interaction.options.getString('nome');
      const local = interaction.options.getString('local') || '';
      const hora = interaction.options.getString('hora') || '';

      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return interaction.editReply('⚠️ Use o formato de data: AAAA-MM-DD');
      }

      eventos.push({ data, nome, local, hora });
      salvarEventos();
      await atualizarCalendario();

      await interaction.editReply(`✅ Evento adicionado: **${nome}** (${data}) ${local ? `📍${local}` : ''} ${hora ? `🕒${hora}` : ''}`);
    }

    if (commandName === 'listeventos') {
      if (eventos.length === 0) return interaction.editReply('📭 Nenhum evento cadastrado.');

      let texto = '**🗓️ Eventos cadastrados:**\n\n';
      eventos.sort((a, b) => new Date(a.data) - new Date(b.data)).forEach(ev => {
        texto += `📅 ${ev.data} — **${ev.nome}**`;
        if (ev.local) texto += ` | 📍${ev.local}`;
        if (ev.hora) texto += ` | 🕒${ev.hora}`;
        texto += '\n';
      });

      await interaction.editReply(texto);
    }

    if (commandName === 'removeevento') {
      const data = interaction.options.getString('data');
      const antes = eventos.length;
      eventos = eventos.filter(ev => ev.data !== data);

      if (eventos.length === antes) {
        return interaction.editReply('⚠️ Nenhum evento encontrado nessa data.');
      }

      salvarEventos();
      await atualizarCalendario();
      await interaction.editReply(`🗑️ Evento removido da data ${data}.`);
    }
  } catch (error) {
    console.error(error);
    await interaction.editReply('❌ Ocorreu um erro ao executar o comando.');
  }
});

client.login(token);

