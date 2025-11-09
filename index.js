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
   ===== TICKET BOT CODE ===
   ========================= */

// CONFIG
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

// READY EVENT
client.once('ready', async () => {
    console.log(`Ticket Bot online as ${client.user.tag}`);

    // Register /add command
    const data = [
        {
            name: 'add',
            description: 'Add a user to the ticket',
            options: [
                {
                    type: 6,
                    name: 'user',
                    description: 'User to add',
                    required: true
                }
            ]
        }
    ];
    await client.guilds.cache.forEach(guild => guild.commands.set(data));
});

// SEND TICKET PANEL
client.on('messageCreate', async message => {
    if (message.content === '!tickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('Support Tickets')
            .setDescription('Select your ticket type from the dropdown below.\n**Pinging staff will result in a blacklist**')
            .setColor('#00FFFF');

        const ticketDropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_type_select')
                .setPlaceholder('Select Ticket Type')
                .addOptions([
                    { label: 'Player Report', value: 'player_report', emoji: '🎮' },
                    { label: 'Bug Report', value: 'bug_report', emoji: '🐛' },
                    { label: 'Staff Report', value: 'staff_report', emoji: '🛡️' },
                    { label: 'Billing Issue', value: 'billing_issue', emoji: '💰' },
                    { label: 'Punishment Appeal', value: 'punishment_appeal', emoji: '⚖️' }
                ])
        );

        const channel = message.guild.channels.cache.get(PANEL_CHANNEL_ID);
        if (channel) channel.send({ embeds: [embed], components: [ticketDropdown] });
        else message.channel.send('Panel channel not found.');
    }
});

// HANDLE DROPDOWN -> SHOW MODAL
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'ticket_type_select') return;

    const ticketType = interaction.values[0];

    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal|${ticketType}`)
        .setTitle('Ticket Info');

    const ignInput = new TextInputBuilder()
        .setCustomId('ign_input')
        .setLabel('Your IGN')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const issueInput = new TextInputBuilder()
        .setCustomId('issue_input')
        .setLabel('Describe your Issue')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(ignInput),
        new ActionRowBuilder().addComponents(issueInput)
    );

    await interaction.showModal(modal);
});

// HANDLE MODAL SUBMIT -> CREATE TICKET CHANNEL
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('ticket_modal|')) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        const ticketType = interaction.customId.split('|')[1];
        const member = interaction.user;

        ticketsData.lastTicket++;
        fs.writeFileSync('./tickets.json', JSON.stringify(ticketsData, null, 4));
        const ticketNumber = ticketsData.lastTicket;

        const ticketChannel = await interaction.guild.channels.create({
            name: `Ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        const ign = interaction.fields.getTextInputValue('ign_input');
        const issue = interaction.fields.getTextInputValue('issue_input');

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket-${ticketNumber}`)
            .setDescription(`<@${member.id}> Thank you for contacting support, a staff member will be with you soon.`)
            .addFields(
                { name: 'IGN', value: ign },
                { name: 'Issue', value: issue }
            )
            .setColor('#00FFFF');

        await ticketChannel.send({ embeds: [embed], components: [closeButton] });
        await interaction.followUp({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
        console.log(`[INFO] Ticket-${ticketNumber} created by ${member.tag}`);
    } catch (err) {
        console.error(err);
        if (!interaction.replied) interaction.followUp({ content: 'An error occurred.', ephemeral: true });
    }
});

// CLOSE BUTTON -> CONFIRM CLOSE
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'close_ticket') return;

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_close|${interaction.channel.id}`)
            .setLabel('Confirm Close')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('cancel_close')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmRow], ephemeral: true });
});

// HANDLE CONFIRM OR CANCEL
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'cancel_close') {
        await interaction.update({ content: 'Ticket close cancelled.', components: [] });
        return;
    }

    if (interaction.customId.startsWith('confirm_close|')) {
        const ticketChannelId = interaction.customId.split('|')[1];

        const modal = new ModalBuilder()
            .setCustomId(`close_modal|${ticketChannelId}`)
            .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason')
            .setLabel('Reason for closing this ticket')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        await interaction.showModal(modal);
    }
});

// HANDLE CLOSE MODAL -> DELETE CHANNEL + DM + TRANSCRIPT
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('close_modal|')) return;

    await interaction.deferReply({ ephemeral: true });

    const [, ticketChannelId] = interaction.customId.split('|');
    const ticketChannel = await interaction.guild.channels.fetch(ticketChannelId).catch(() => null);
    if (!ticketChannel) return interaction.followUp({ content: 'Ticket channel not found!', ephemeral: true });

    const reason = interaction.fields.getTextInputValue('close_reason');
    const staffMember = interaction.user;
    const ticketCreator = ticketChannel.members.filter(m => !m.user.bot).first();

    const openedAt = Math.floor(ticketChannel.createdTimestamp / 1000);
    const closedAt = Math.floor(Date.now() / 1000);

    if (ticketCreator) {
        const dmEmbed = new EmbedBuilder()
            .setTitle('**Coralises | Ticket Closed**')
            .setDescription(`🆔 Ticket ID: ${ticketChannel.name}
📂 Opened By: <@${ticketCreator.id}>
🔒 Closed By: <@${staffMember.id}>
⏱ Opened At: <t:${openedAt}:F>
❓ Reason: ${reason}
📅 Closed At: <t:${closedAt}:F>`)
            .setColor('#FF0000');

        try { await ticketCreator.send({ embeds: [dmEmbed] }); } catch {}
    }

    const messages = await ticketChannel.messages.fetch({ limit: 100 });
    const transcriptEmbed = new EmbedBuilder()
        .setTitle('**Coralises | Ticket Closed**')
        .setDescription(`🆔 Ticket ID: ${ticketChannel.name}
📂 Opened By: <@${ticketCreator?.id || 'Unknown'}>
🔒 Closed By: <@${staffMember.id}>
⏱ Opened At: <t:${openedAt}:F>
❓ Reason: ${reason}
📅 Closed At: <t:${closedAt}:F>`)
        .addFields(
            { name: 'Transcript', value: messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n') || 'No messages' }
        )
        .setColor('#00FFFF');

    const transcriptChannel = interaction.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) transcriptChannel.send({ embeds: [transcriptEmbed] });

    await ticketChannel.delete().catch(() => {});
    await interaction.followUp({ content: 'Ticket closed successfully.', ephemeral: true });
});

// /ADD COMMAND
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'add') return;

    const user = interaction.options.getUser('user');
    const channel = interaction.channel;

    if (!channel.name.startsWith('Ticket-')) 
        return interaction.reply({ content: 'This command can only be used in tickets.', ephemeral: true });
    if (!user) 
        return interaction.reply({ content: 'User not found.', ephemeral: true });

    const ticketCreator = channel.members.filter(m => !m.user.bot).first();
    if (!ticketCreator) return interaction.reply({ content: 'Cannot determine ticket creator.', ephemeral: true });
    if (user.id === ticketCreator.id) return interaction.reply({ content: 'You cannot add the ticket creator again.', ephemeral: true });

    const memberInGuild = channel.guild.members.cache.get(user.id);
    if (memberInGuild.roles.cache.has(STAFF_ROLE_ID)) return interaction.reply({ content: 'You cannot add staff using this command.', ephemeral: true });

    await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
    interaction.reply({ content: `<@${user.id}> has been added to this ticket.` });
});

/* =========================
   ===== TICKET BOT CODE ===
   ========================= */

// APPLICATION BOT
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');

// CONFIG
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

const TRANSCRIPT_CHANNEL_ID = '1434722990360231967';
const APPLICATION_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

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

// SEND APPLICATION PANEL
client.on('messageCreate', async message => {
    if (message.content === '!apps' && message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
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

        await message.channel.send({ embeds: [embed], components: [dropdown] });
    }
});

// HANDLE DROPDOWN SELECTION
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
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
});

// HANDLE START / CANCEL BUTTONS
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
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
});

// APPLICATION MESSAGE COLLECTOR
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
        if (index >= questions.length) {
            collector.stop('completed');
            return;
        }
        dm.send(questions[index]);
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'cancelled') return dm.send('Application cancelled.');

        const channelId = type === 'staff_app' ? APPLICATION_CHANNELS.STAFF :
                          type === 'builder_app' ? APPLICATION_CHANNELS.BUILDER :
                          APPLICATION_CHANNELS.DEV;
        const staffChannel = await client.channels.fetch(channelId);

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} Application`)
            .setDescription('Application Submitted')
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

        await staffChannel.send({ embeds: [embed], components: [buttons] });
        await dm.send('✅ Your application has been submitted!');
    });
}

// ACCEPT / DENY BUTTON HANDLERS
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const embed = interaction.message.embeds[0];
    if (!embed) return;

    const username = embed.title.split("'s")[0];
    const guild = interaction.guild;
    const member = guild.members.cache.find(m => m.user.username === username);
    if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });

    const type = embed.title.includes('Staff') ? 'staff_app' :
                 embed.title.includes('Builder') ? 'builder_app' :
                 embed.title.includes('Dev') ? 'dev_app' : '';

    // Accept / Deny
    if (interaction.customId === 'accept_app') await handleAcceptance(member, type, interaction, '');
    if (interaction.customId === 'close_app') await handleDenial(member, type, interaction, '');

    // Accept / Deny with reason
    if (interaction.customId === 'accept_app_reason') {
        await interaction.showModal(
            new ModalBuilder()
                .setCustomId(`accept_reason_modal|${member.id}|${type}`)
                .setTitle('Accept Application')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('accept_reason_input')
                        .setLabel('Reason for acceptance')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ))
        );
    }
    if (interaction.customId === 'close_app_reason') {
        await interaction.showModal(
            new ModalBuilder()
                .setCustomId(`deny_reason_modal|${member.id}|${type}`)
                .setTitle('Deny Application')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('deny_reason_input')
                        .setLabel('Reason for denial')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ))
        );
    }

    if (interaction.customId === 'open_ticket_app') {
        // Open a DM thread for discussion
        member.send(`A staff member has opened a ticket with you regarding your application.`).catch(() => null);
        interaction.reply({ content: 'User has been notified in DMs.', ephemeral: true });
    }
});

// HANDLE MODAL SUBMITS
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('accept_reason_modal|')) {
        const [, userId, type] = interaction.customId.split('|');
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        const reason = interaction.fields.getTextInputValue('accept_reason_input');
        await handleAcceptance(member, type, interaction, reason);
    }

    if (interaction.customId.startsWith('deny_reason_modal|')) {
        const [, userId, type] = interaction.customId.split('|');
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        const reason = interaction.fields.getTextInputValue('deny_reason_input');
        await handleDenial(member, type, interaction, reason);
    }
});

// HELPER FUNCTIONS
async function handleAcceptance(member, type, interaction, reason) {
    const rolesToAdd = [];
    if (type === 'staff_app') rolesToAdd.push(ROLES.STAFF, ROLES.TRAINEE);
    if (type === 'builder_app') rolesToAdd.push(ROLES.STAFF, ROLES.BUILDER);
    if (type === 'dev_app') rolesToAdd.push(ROLES.STAFF, ROLES.DEV);

    await member.roles.add(rolesToAdd).catch(() => null);
    await member.send(`✅ Your application for ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} has been accepted!${reason ? `\nReason: ${reason}` : ''}`).catch(() => null);
    if (interaction.update) await interaction.update({ content: `Application accepted for ${member.user.tag}`, components: [] });
}

async function handleDenial(member, type, interaction, reason) {
    await member.send(`❌ Your application for ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} has been denied.${reason ? `\nReason: ${reason}` : ''}`).catch(() => null);
    if (interaction.update) await interaction.update({ content: `Application denied for ${member.user.tag}`, components: [] });
}

// AUTOMATIC LOGGING OF APPLICATION CHANNELS
client.on('channelDelete', async channel => {
    if (![APPLICATION_CHANNELS.STAFF, APPLICATION_CHANNELS.BUILDER, APPLICATION_CHANNELS.DEV].includes(channel.id)) return;

    const messages = await channel.messages.fetch({ limit: 100 });
    const transcriptEmbed = new EmbedBuilder()
        .setTitle('📄 Application Transcript')
        .setDescription(`Transcript of <#${channel.id}>`)
        .addFields({ name: 'Messages', value: messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n') || 'No messages' })
        .setColor('#00FFFF');

    const transcriptChannel = channel.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) transcriptChannel.send({ embeds: [transcriptEmbed] });
}
);

client.login(process.env.TOKEN);
