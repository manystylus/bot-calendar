require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Routes, 
    ApplicationCommandOptionType, 
    REST 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- Configurações Iniciais ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Necessário se você usa 'messageCreate' para algo que não sejam comandos de barra
    ]
});

const channelId = process.env.CHANNEL_ID;
const token = process.env.TOKEN; // Assume que o token está no .env
const eventosFile = path.join(__dirname, 'eventos.json');

// 🗂️ Carrega eventos salvos
let eventos = [];
if (fs.existsSync(eventosFile)) {
    try {
        eventos = JSON.parse(fs.readFileSync(eventosFile, 'utf8'));
    } catch (e) {
        console.error('⚠️ Erro ao ler eventos.json. Inicializando lista vazia.', e);
        eventos = [];
    }
}

// 💾 Salvar eventos
function salvarEventos() {
    fs.writeFileSync(eventosFile, JSON.stringify(eventos, null, 2));
}

// 📅 Gera o texto do calendário
function gerarCalendario() {
    const agora = new Date();
    // Para garantir a formatação correta em pt-BR
    const options = { month: 'long', timeZone: 'America/Sao_Paulo' }; 
    const mes = agora.toLocaleString('pt-BR', options); 
    const ano = agora.getFullYear();

    let texto = `**📅 ${mes.toUpperCase()} ${ano}**\n\n`;

    // Filtra apenas eventos futuros ou de hoje
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

// 🔁 Atualiza o calendário no canal
async function atualizarCalendario() {
    try {
        const canal = await client.channels.fetch(channelId);
        if (!canal) return console.error(`Canal com ID ${channelId} não encontrado.`);

        const mensagens = await canal.messages.fetch({ limit: 10 });
        const msgCalendario = mensagens.find(m => m.author.id === client.user.id);

        const novoTexto = gerarCalendario();

        if (msgCalendario) {
            await msgCalendario.edit(novoTexto);
        } else {
            await canal.send(novoTexto);
        }
    } catch (error) {
        console.error('❌ Erro ao atualizar calendário:', error);
    }
}

// 🕐 Envia lembretes automáticos (diariamente)
async function verificarLembretes() {
    try {
        // Pega a data de hoje no fuso horário para evitar problemas de meia-noite
        const dataLocal = new Date().toLocaleString("en-CA", { timeZone: "America/Sao_Paulo" });
        const hoje = dataLocal.split(',')[0].replace(/\//g, '-').split('-').reverse().join('-'); // Formato YYYY-MM-DD

        const eventosDeHoje = eventos.filter(ev => ev.data === hoje);

        if (eventosDeHoje.length > 0) {
            const canal = await client.channels.fetch(channelId);
            if (!canal) return;

            for (const ev of eventosDeHoje) {
                await canal.send(`📣 **Lembrete:** Hoje acontece **${ev.nome}**! ${ev.local ? `📍${ev.local}` : ''} ${ev.hora ? `🕒 ${ev.hora}` : ''}`);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar lembretes:', error);
    }
}

// 📋 Definição dos Slash Commands
const COMMANDS = [
    {
        name: 'ajuda',
        description: 'Mostra os comandos disponíveis do bot.',
    },
    {
        name: 'addevento',
        description: 'Adiciona um novo evento ao calendário.',
        options: [
            {
                name: 'data',
                description: 'A data do evento (AAAA-MM-DD).',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'nome',
                description: 'O nome do evento.',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'local',
                description: 'O local do evento.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
            {
                name: 'hora',
                description: 'A hora do evento (Ex: 14h, 15:30).',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'listareventos',
        description: 'Lista todos os eventos futuros cadastrados.',
    },
    {
        name: 'removerevento',
        description: 'Remove um evento de uma data específica.',
        options: [
            {
                name: 'data',
                description: 'A data do evento a ser removido (AAAA-MM-DD).',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
];

// 🧭 Inicia o bot
client.once('ready', async () => {
    console.log(`✅ Bot logado como ${client.user.tag}`);

    // 🚀 Registra os comandos (Global)
    try {
        if (!client.user.id || !token) {
            console.error("TOKEN ou CLIENT_ID faltando. Não foi possível registrar comandos.");
            return;
        }
        
        const rest = new REST({ version: '10' }).setToken(token);
        
        await rest.put(
            Routes.applicationCommands(client.user.id), // Para comandos globais
            { body: COMMANDS },
        );

        console.log('✨ Comandos de barra registrados com sucesso! Pode demorar até 1h para aparecer globalmente, ou tente em um servidor de teste.');

    } catch (error) {
        console.error('❌ Erro ao registrar comandos de barra:', error);
    }

    // Inicializa o calendário e lembretes
    atualizarCalendario();
    
    // Verifica lembretes a cada 6h (6 * 60 * 60 * 1000 ms)
    setInterval(verificarLembretes, 6 * 60 * 60 * 1000); 
});

// 💬 Tratamento dos Slash Commands
client.on('interactionCreate', async (interaction) => {
    // Apenas processa comandos de barra de chat
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ⏳ Resposta inicial para evitar timeout (Discord exige resposta em 3s)
    // Usamos deferReply e editReply, pois nossas funções são assíncronas
    await interaction.deferReply({ ephemeral: false });

    try {
        if (commandName === 'ajuda') {
            const texto = `
**🧭 COMANDOS DO BOT DE CALENDÁRIO**

📅 \`/addevento\`
Adiciona um novo evento. Use as opções para Data, Nome, Local e Hora.

🗓️ \`/listareventos\`
Mostra todos os eventos futuros.

🗑️ \`/removerevento\`
Remove o evento de uma data.

🕐 O bot avisa automaticamente quando houver um evento no dia!
`;
            await interaction.editReply(texto);

        } else if (commandName === 'addevento') {
            const data = interaction.options.getString('data');
            const nome = interaction.options.getString('nome');
            const local = interaction.options.getString('local') || '';
            const hora = interaction.options.getString('hora') || '';
            
            if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
                return interaction.editReply('⚠️ Formato de data inválido. Use: AAAA-MM-DD');
            }
            if (eventos.some(ev => ev.data === data && ev.nome === nome)) {
                return interaction.editReply('⚠️ Um evento com esse nome já existe para esta data.');
            }

            eventos.push({ data, nome, local, hora });
            salvarEventos();
            await atualizarCalendario();

            await interaction.editReply(`✅ Evento adicionado: **${nome}** (${data}) ${local ? `📍${local}` : ''} ${hora ? `🕒${hora}` : ''}`);

        } else if (commandName === 'listareventos') {
            if (eventos.length === 0) {
                return interaction.editReply('📭 Nenhum evento cadastrado ainda.');
            }

            let texto = '**🗓️ Eventos cadastrados:**\n\n';
            eventos
                .sort((a, b) => new Date(a.data) - new Date(b.data))
                .forEach(ev => {
                    texto += `📅 ${ev.data} — **${ev.nome}**`;
                    if (ev.local) texto += ` | 📍${ev.local}`;
                    if (ev.hora) texto += ` | 🕒${ev.hora}`;
                    texto += '\n';
                });

            await interaction.editReply(texto);

        } else if (commandName === 'removerevento') {
            const data = interaction.options.getString('data');

            const antes = eventos.length;
            // Filtra e remove o evento com a data específica
            eventos = eventos.filter(ev => ev.data !== data); 
            
            if (eventos.length === antes) {
                return interaction.editReply('⚠️ Nenhum evento encontrado nessa data.');
            }

            salvarEventos();
            await atualizarCalendario();

            await interaction.editReply(`🗑️ Evento removido da data ${data}.`);
        }
    } catch (error) {
        console.error(`❌ Erro no comando /${commandName}:`, error);
        // Resposta de erro para o usuário
        await interaction.editReply({ content: '❌ Ocorreu um erro interno ao executar este comando.', ephemeral: true });
    }
});

client.login(token);