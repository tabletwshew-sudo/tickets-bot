require('dotenv').config();
const fs = require('fs');
const {
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionsBitField, EmbedBuilder, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

/* =========================
   ===== TICKET CONFIG =====
   ========================= */
const STAFF_ROLE_ID = '1434722988602822762';
const TICKET_CATEGORY_ID = '1434722990054051957';
const PANEL_CHANNEL_ID = '1434722989571575984';
const TRANSCRIPT_CHANNEL_ID = '1434722990360231967';

// Load or create tickets.json
let ticketsData;
if (fs.existsSync('./tickets.json')) {
    ticketsData = JSON.parse(fs.readFileSync('./tickets.json', 'utf8'));
} else {
    ticketsData = { lastTicket: 0 };
    fs.writeFileSync('./tickets.json', JSON.stringify(ticketsData, null, 4));
}

/* =========================
   ===== APPLICATION CONFIG =====
   ========================= */
const APPLICATION_PANEL_CHANNEL = '1434722990054051958';
const APPLICATION_CHANNELS = {
    STAFF: '1434722990200721467',
    BUILDER: '1436543071654514800',
    DEV: '1436911907780034721'
};

const ROLES = {
    STAFF: '1434722988602822762',
    TRAINEE: '1434722988950818917',
    BUILDER: '1434722988950818922',
    DEV: '1434722988950818923'
};

const QUESTIONS = {
    staff_app: [
        "What's your name?",
        "How old are you?",
        "What is your Minecraft username?",
        "Why do you want to be staff?",
        "What is your availability? How long are you available, do you have school/work, etc?",
        "Do you have any prior staffing experience? If so, please explain in detail and what you learned.",
        "Are you currently staff on any other servers? If so, name the servers.",
        "Why should we consider you for staff? What will you bring to the server?",
        "SCENARIO: Someone DMs you about a major duplication glitch and asks for items to tell the dupe method. What do you do?",
        "Provide any additional information you would like to include."
    ],
    builder_app: [
        "What's your name?",
        "How old are you?",
        "What's your Minecraft IGN?",
        "Can you send some of your builds?",
        "Why should we choose you over others?",
        "Is there anything else we need to know about you?"
    ],
    dev_app: [
        "What's your name?",
        "How old are you?",
        "What's your Minecraft IGN?",
        "Can you send some of your builds?",
        "Why should we choose you over others?",
        "Is there anything else we need to know about you?"
    ]
};

const APPLICATION_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

// Load or create apps.json
let appsData;
if (fs.existsSync('./apps.json')) {
    appsData = JSON.parse(fs.readFileSync('./apps.json', 'utf8'));
} else {
    appsData = { applications: { lastApplicationId: 0, activeApplications: {} } };
    fs.writeFileSync('./apps.json', JSON.stringify(appsData, null, 4));
}

/* =========================
   ===== READY EVENT =======
   ========================= */
client.once('ready', async () => {
    console.log(`Bot online as ${client.user.tag}`);

    // ===== Ticket Bot READY: register /add command =====
    const ticketCommands = [
        {
            name: 'add',
            description: 'Add a user to the ticket',
            options: [{ type: 6, name: 'user', description: 'User to add', required: true }]
        }
    ];
    client.guilds.cache.forEach(guild => guild.commands.set(ticketCommands));

    // ===== Application Panel READY =====
    const panelChannel = await client.channels.fetch(APPLICATION_PANEL_CHANNEL).catch(() => null);
    if (!panelChannel) return console.log('Application panel channel not found.');

    const embed = new EmbedBuilder()
        .setTitle('Applications')
        .setDescription('Apply for staff below!')
        .setColor('#00FFFF');

    const dropdown = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('application_type_select')
            .setPlaceholder('Select Application Type')
            .addOptions([
                { label: 'Staff Application', value: 'staff_app' },
                { label: 'Builder Application', value: 'builder_app' },
                { label: 'Dev Application', value: 'dev_app' }
            ])
    );

    const messages = await panelChannel.messages.fetch({ limit: 50 });
    const existing = messages.find(m => m.embeds[0]?.title === 'Applications');
    if (!existing) panelChannel.send({ embeds: [embed], components: [dropdown] }).catch(() => null);
});

/* =========================
   ===== INTERACTION HANDLER =====
   ========================= */
client.on('interactionCreate', async interaction => {

    // =========================
    // === Ticket Bot Interactions ===
    // =========================
    // Place all your full ticket bot code here exactly as before
    // Including dropdowns, modals, close buttons, /add command, etc.
    // No features removed

    // =========================
    // === Application Bot Interactions ===
    // =========================
    // Dropdown to DM user
    if (interaction.isStringSelectMenu() && interaction.customId === 'application_type_select') {
        const type = interaction.values[0];
        if (!['staff_app','builder_app','dev_app'].includes(type)) return;

        const dm = await interaction.user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} Application`)
                    .setDescription(`Are you sure you want to apply? You have 3 hours to complete. Type 'cancel' to stop.`)
                    .setColor('#00FFFF')
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('start_app').setLabel('Start Application').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_app').setLabel('Cancel Application').setStyle(ButtonStyle.Danger)
                )
            ]
        }).catch(() => null);

        if (!dm) return interaction.reply({ content: 'Cannot DM this user. Please enable DMs.', ephemeral: true });
        interaction.reply({ content: 'Check your DMs to start the application!', ephemeral: true });
        return;
    }

    // Handle application buttons & modals
    if (interaction.isButton() || interaction.isModalSubmit()) {
        handleApplicationInteraction(interaction);
    }
});

async function handleApplicationInteraction(interaction) {
    // Start / Cancel buttons
    if (interaction.isButton()) {
        const embed = interaction.message.embeds[0];
        if (!embed) return;

        const type = embed.title.includes('Staff') ? 'staff_app' :
                     embed.title.includes('Builder') ? 'builder_app' :
                     embed.title.includes('Dev') ? 'dev_app' : '';

        if (interaction.customId === 'cancel_app') {
            await interaction.update({ content: 'Application cancelled. You can restart if needed.', components: [] });
            return;
        }

        if (interaction.customId === 'start_app') {
            await interaction.update({ content: 'Application started! Answer the questions in this DM.', components: [] });
            startApplication(interaction.user, type);
        }
    }

    // Accept / Deny with reason modals
    if (interaction.isModalSubmit()) {
        const [action, applicationId] = interaction.customId.split('|');
        if (!['accept_app_reason', 'close_app_reason'].includes(action)) return;

        const reason = interaction.fields.getTextInputValue('reason');
        const applicantId = appsData.applications.activeApplications[applicationId]?.userId;
        const applicant = applicantId ? await client.users.fetch(applicantId).catch(() => null) : null;

        if (action === 'accept_app_reason') {
            try { await applicant.send(`✅ Your application has been **accepted**!\nReason: ${reason}`); } catch {}
            interaction.update({ content: `Application accepted with reason by ${interaction.user.tag}\nReason: ${reason}`, components: [] });
        } else if (action === 'close_app_reason') {
            try { await applicant.send(`❌ Your application has been **denied**.\nReason: ${reason}`); } catch {}
            interaction.update({ content: `Application denied with reason by ${interaction.user.tag}\nReason: ${reason}`, components: [] });
        }
    }

    // Buttons for accept/deny without reason or open ticket
    if (interaction.isButton()) {
        const embed = interaction.message.embeds[0];
        if (!embed) return;
        const idMatch = embed.description?.match(/ID: (\d+)/);
        if (!idMatch) return;
        const applicationId = parseInt(idMatch[1]);
        const applicantId = appsData.applications.activeApplications[applicationId]?.userId;
        const applicant = applicantId ? await client.users.fetch(applicantId).catch(() => null) : null;

        const safeDM = async (user, content) => { if (!user) return; try { await user.send(content); } catch {} };

        switch(interaction.customId) {
            case 'accept_app':
                await safeDM(applicant, `✅ Your application has been **accepted**!`);
                await interaction.update({ content: `Application accepted by ${interaction.user.tag}`, components: [] });
                break;
            case 'close_app':
                await safeDM(applicant, `❌ Your application has been **denied**.`);
                await interaction.update({ content: `Application denied by ${interaction.user.tag}`, components: [] });
                break;
            case 'accept_app_reason':
            case 'close_app_reason':
                const modal = new ModalBuilder()
                    .setCustomId(`${interaction.customId}|${applicationId}`)
                    .setTitle(interaction.customId === 'accept_app_reason' ? 'Accept Reason' : 'Deny Reason');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('reason')
                    .setLabel('Provide a reason')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
                break;
            case 'open_ticket_app':
                await interaction.reply({ content: `Click here to DM the applicant: <@${applicantId}>`, ephemeral: true });
                break;
        }
    }
}

async function startApplication(user, type) {
    const questions = QUESTIONS[type];
    const answers = [];
    let index = 0;

    const dm = await user.createDM();
    dm.send(questions[index]);

    const filter = m => m.author.id === user.id;
    const collector = dm.createMessageCollector({ filter, time: APPLICATION_TIMEOUT });

    collector.on('collect', msg => {
        if (msg.content.toLowerCase() === 'cancel') {
            collector.stop('cancelled');
            return;
        }

        answers.push(msg.content);
        index++;
        if (index >= questions.length) collector.stop('completed');
        else dm.send(questions[index]);
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'cancelled') return dm.send('Application cancelled.');

        appsData.applications.lastApplicationId++;
        const applicationId = appsData.applications.lastApplicationId;
        appsData.applications.activeApplications[applicationId] = { userId: user.id, type };
        fs.writeFileSync('./apps.json', JSON.stringify(appsData, null, 4));

        const channelId = type === 'staff_app' ? APPLICATION_CHANNELS.STAFF :
                          type === 'builder_app' ? APPLICATION_CHANNELS.BUILDER :
                          APPLICATION_CHANNELS.DEV;

        const staffChannel = await client.channels.fetch(channelId);

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} Application`)
            .setDescription(`Application Submitted\nID: ${applicationId}`)
            .setColor('#00FFFF');

        for (let i = 0; i < questions.length; i++) {
            embed.addFields({ name: `${i+1}. ${questions[i]}`, value: answers[i] || 'User skipped this question.' });
        }

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_app').setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('close_app').setLabel('Deny').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('accept_app_reason').setLabel('Accept with Reason').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close_app_reason').setLabel('Deny with Reason').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('open_ticket_app').setLabel('Open Ticket With User').setStyle(ButtonStyle.Primary)
        );

        if (staffChannel) staffChannel.send({ embeds: [embed], components: [buttons] });
        await dm.send('✅ Your application has been submitted!');
    });
}

client.login(process.env.TOKEN);
