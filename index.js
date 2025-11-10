// index.js
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
   ===== CONFIG ===========
   ========================= */
// Ticket config (kept as you requested)
const STAFF_ROLE_ID = '1434722988602822762';
const TICKET_CATEGORY_ID = '1434722990054051957';
const TICKET_PANEL_CHANNEL_ID = '1434722989571575984';
const TRANSCRIPT_CHANNEL_ID = '1434722990360231967';

// Application config
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

const APPLICATION_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours
const TRANSCRIPT_PRUNE_DAYS = 30; // clean old logs after 30 days

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

/* =========================
   ===== JSON Storage ======
   ========================= */
const TICKETS_JSON = './tickets.json';
const APPS_JSON = './apps.json';

let ticketsData;
if (fs.existsSync(TICKETS_JSON)) {
    ticketsData = JSON.parse(fs.readFileSync(TICKETS_JSON, 'utf8'));
} else {
    ticketsData = { lastTicket: 0 }; // keep original structure
    fs.writeFileSync(TICKETS_JSON, JSON.stringify(ticketsData, null, 4));
}

let appsData;
if (fs.existsSync(APPS_JSON)) {
    appsData = JSON.parse(fs.readFileSync(APPS_JSON, 'utf8'));
} else {
    appsData = { applications: { lastApplicationId: 0, activeApplications: {} }, archived: {} };
    fs.writeFileSync(APPS_JSON, JSON.stringify(appsData, null, 4));
}

/* =========================
   ===== Ready / Panels ====
   ========================= */
client.once('ready', async () => {
    console.log(`Bot online as ${client.user.tag}`);

    // Register /add command for tickets (keeps existing ticket behaviour)
    const ticketCommands = [
        {
            name: 'add',
            description: 'Add a user to the ticket',
            options: [{ type: 6, name: 'user', description: 'User to add', required: true }]
        }
    ];
    client.guilds.cache.forEach(guild => guild.commands.set(ticketCommands).catch(() => {}));

    // Post ticket panel (if needed) - admin can use !tickets too
    try {
        const ticketPanel = await client.channels.fetch(TICKET_PANEL_CHANNEL_ID).catch(() => null);
        if (ticketPanel) {
            // don't spam: check existing messages for title
            const msgs = await ticketPanel.messages.fetch({ limit: 50 }).catch(() => null);
            const existing = msgs?.find(m => m.embeds[0]?.title === 'Support Tickets');
            if (!existing) {
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
                ticketPanel.send({ embeds: [embed], components: [ticketDropdown] }).catch(() => {});
            }
        }
    } catch (err) { console.error('ticket panel ready error', err); }

    // Post application panel once (if not present)
    try {
        const panelChannel = await client.channels.fetch(APPLICATION_PANEL_CHANNEL).catch(() => null);
        if (panelChannel) {
            const messages = await panelChannel.messages.fetch({ limit: 50 }).catch(() => null);
            const existing = messages?.find(m => m.embeds[0]?.title === 'Applications');
            if (!existing) {
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
                panelChannel.send({ embeds: [embed], components: [dropdown] }).catch(() => {});
            }
        }
    } catch (err) { console.error('application panel ready error', err); }

    // Set daily cleanup for archived apps/log pruning
    setInterval(pruneOldApplications, 24 * 60 * 60 * 1000); // once a day
});

/* =========================
   ===== Utilities =========
   ========================= */
function saveApps() {
    fs.writeFileSync(APPS_JSON, JSON.stringify(appsData, null, 4));
}
function saveTickets() {
    fs.writeFileSync(TICKETS_JSON, JSON.stringify(ticketsData, null, 4));
}

// prune older archived entries + activeApplications older than 30 days -> move to archived
function pruneOldApplications() {
    try {
        const now = Date.now();
        const cutoff = now - TRANSCRIPT_PRUNE_DAYS * 24 * 60 * 60 * 1000;
        const apps = appsData.applications.activeApplications;
        for (const id of Object.keys(apps)) {
            if (apps[id].createdAt && apps[id].createdAt < cutoff) {
                appsData.archived[id] = apps[id];
                delete apps[id];
            }
        }
        // archive older archived entries (optionally remove them entirely)
        saveApps();
        console.log('Pruned old applications.');
    } catch (err) { console.error('prune error', err); }
}

/* =========================
   ===== Central handler ===
   =========================
   We'll handle:
   - messageCreate for !apps and !tickets (so admin can repost panels)
   - interactionCreate for: ticket dropdown, application dropdown, buttons, modals, /add command
   ========================= */

client.on('messageCreate', async message => {
    // ignore bots
    if (message.author.bot) return;

    // Admin command to repost tickets panel anywhere (keeps original behavior)
    if (message.content === '!tickets' && message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
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

        const channel = message.guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
        if (channel) channel.send({ embeds: [embed], components: [ticketDropdown] });
        else message.channel.send('Panel channel not found.');
        return;
    }

    // Admin command to repost apps panel anywhere (you asked to use !apps)
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
        await message.channel.send({ embeds: [embed], components: [dropdown] }).catch(() => {});
        return;
    }
});

/* =========================
   ===== Interaction router
   ========================= */
client.on('interactionCreate', async interaction => {
    try {
        // ---------- Ticket dropdown selection -> show ticket modal ----------
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
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

            modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(issueInput));
            await interaction.showModal(modal);
            return;
        }

        // ---------- Ticket modal submit -> create ticket channel ----------
        if (interaction.isModalSubmit() && interaction.customId?.startsWith('ticket_modal|')) {
            await interaction.deferReply({ ephemeral: true });
            try {
                const ticketType = interaction.customId.split('|')[1];
                const member = interaction.user;

                ticketsData.lastTicket++;
                saveTickets();
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
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                );

                const embed = new EmbedBuilder()
                    .setTitle(`🎫 Ticket-${ticketNumber}`)
                    .setDescription(`<@${member.id}> Thank you for contacting support, a staff member will be with you soon.`)
                    .addFields({ name: 'IGN', value: ign }, { name: 'Issue', value: issue })
                    .setColor('#00FFFF');

                await ticketChannel.send({ embeds: [embed], components: [closeButton] });
                await interaction.followUp({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
                console.log(`[INFO] Ticket-${ticketNumber} created by ${member.tag}`);
            } catch (err) {
                console.error('ticket modal submission error', err);
                if (!interaction.replied) interaction.followUp({ content: 'An error occurred.', ephemeral: true });
            }
            return;
        }

        // ---------- Ticket close flow (confirm -> modal -> transcript + delete) ----------
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confirm_close|${interaction.channel.id}`).setLabel('Confirm Close').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_close').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );
            await interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmRow], ephemeral: true });
            return;
        }

        if (interaction.isButton() && interaction.customId === 'cancel_close') {
            await interaction.update({ content: 'Ticket close cancelled.', components: [] });
            return;
        }

        if (interaction.isButton() && interaction.customId?.startsWith('confirm_close|')) {
            const ticketChannelId = interaction.customId.split('|')[1];
            const modal = new ModalBuilder().setCustomId(`close_modal|${ticketChannelId}`).setTitle('Close Ticket');
            const reasonInput = new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing this ticket').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await interaction.showModal(modal);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId?.startsWith('close_modal|')) {
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

            // transcript (last 100)
            const messages = await ticketChannel.messages.fetch({ limit: 100 });
            const transcriptText = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n') || 'No messages';

            const transcriptEmbed = new EmbedBuilder()
                .setTitle('**Coralises | Ticket Closed**')
                .setDescription(`🆔 Ticket ID: ${ticketChannel.name}
📂 Opened By: <@${ticketCreator?.id || 'Unknown'}>
🔒 Closed By: <@${staffMember.id}>
⏱ Opened At: <t:${openedAt}:F>
❓ Reason: ${reason}
📅 Closed At: <t:${closedAt}:F>`)
                .addFields({ name: 'Transcript', value: transcriptText.length > 1020 ? transcriptText.slice(0, 1015) + '...' : transcriptText })
                .setColor('#00FFFF');

            const transcriptChannel = interaction.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
            if (transcriptChannel) transcriptChannel.send({ embeds: [transcriptEmbed] }).catch(() => {});

            // optionally store transcript to JSON for search / logs
            const archiveId = `ticket-${Date.now()}`;
            if (!appsData.archived) appsData.archived = {};
            appsData.archived[archiveId] = { type: 'ticket_transcript', channel: ticketChannel.name, transcript: transcriptText, closedBy: staffMember.id, closedAt: Date.now() };
            saveApps();

            await ticketChannel.delete().catch(() => {});
            await interaction.followUp({ content: 'Ticket closed successfully.', ephemeral: true });
            return;
        }

        // ---------- Ticket /add command (chat input) ----------
        if (interaction.isChatInputCommand() && interaction.commandName === 'add') {
            const user = interaction.options.getUser('user');
            const channel = interaction.channel;
            if (!channel?.name?.startsWith?.('Ticket-')) return interaction.reply({ content: 'This command can only be used in tickets.', ephemeral: true });
            if (!user) return interaction.reply({ content: 'User not found.', ephemeral: true });

            const ticketCreator = channel.members.filter(m => !m.user.bot).first();
            if (!ticketCreator) return interaction.reply({ content: 'Cannot determine ticket creator.', ephemeral: true });
            if (user.id === ticketCreator.id) return interaction.reply({ content: 'You cannot add the ticket creator again.', ephemeral: true });

            const memberInGuild = channel.guild.members.cache.get(user.id);
            if (memberInGuild.roles.cache.has(STAFF_ROLE_ID)) return interaction.reply({ content: 'You cannot add staff using this command.', ephemeral: true });

            await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
            return interaction.reply({ content: `<@${user.id}> has been added to this ticket.` });
        }

        // ---------- Application dropdown selection (DM the user) ----------
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
                        new ButtonBuilder().setCustomId(`start_app|${type}`).setLabel('Start Application').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('cancel_app').setLabel('Cancel Application').setStyle(ButtonStyle.Danger)
                    )
                ]
            }).catch(() => null);

            if (!dm) return interaction.reply({ content: 'Cannot DM you. Please enable DMs.', ephemeral: true });
            await interaction.reply({ content: 'Check your DMs to start the application!', ephemeral: true });
            return;
        }

        // ---------- Application buttons in DM: Start / Cancel ----------
        if (interaction.isButton() && interaction.customId?.startsWith('start_app|')) {
            // customId: start_app|<type>
            const [, type] = interaction.customId.split('|');
            await interaction.update({ content: 'Application started! Answer the questions in this DM. Type "cancel" to stop at any time.', components: [] }).catch(() => {});
            startApplication(interaction.user, type);
            return;
        }
        if (interaction.isButton() && interaction.customId === 'cancel_app') {
            await interaction.update({ content: 'Application cancelled. You can restart if needed.', components: [] }).catch(() => {});
            return;
        }

        // ---------- Application accept/deny/open ticket/with reason buttons in staff channel ----------
        if (interaction.isButton() && ['accept_app','close_app','accept_app_reason','close_app_reason','open_ticket_app'].includes(interaction.customId)) {
            // buttons sit in staff log messages; each embed contains "ID: <id>" in description
            const embed = interaction.message.embeds[0];
            if (!embed) return interaction.reply({ content: 'Embed data not found.', ephemeral: true });

            const idMatch = embed.description?.match(/ID:\s*(\d+)/);
            if (!idMatch) return interaction.reply({ content: 'Application ID not found in embed.', ephemeral: true });
            const applicationId = parseInt(idMatch[1]);
            const appEntry = appsData.applications.activeApplications[applicationId];
            if (!appEntry) return interaction.reply({ content: 'Application is no longer active or not found.', ephemeral: true });

            const applicant = await client.users.fetch(appEntry.userId).catch(() => null);

            // Accept without reason
            if (interaction.customId === 'accept_app') {
                await handleAcceptanceByStaff(applicant, appEntry.type, applicationId, interaction, '');
                return;
            }
            // Deny without reason
            if (interaction.customId === 'close_app') {
                await handleDenialByStaff(applicant, appEntry.type, applicationId, interaction, '');
                return;
            }
            // Open modal to collect reason and then accept/deny
            if (interaction.customId === 'accept_app_reason' || interaction.customId === 'close_app_reason') {
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
                return;
            }

            // Open ticket with user - create real ticket channel (reusing ticket channel creation)
            if (interaction.customId === 'open_ticket_app') {
                // create a ticket channel for applicant
                try {
                    // increment ticket id same as ticket system
                    ticketsData.lastTicket++;
                    saveTickets();
                    const ticketNumber = ticketsData.lastTicket;
                    const guild = interaction.guild;
                    const ticketChannel = await guild.channels.create({
                        name: `Ticket-${ticketNumber}`,
                        type: ChannelType.GuildText,
                        parent: TICKET_CATEGORY_ID,
                        permissionOverwrites: [
                            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                            { id: appEntry.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                            { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                        ]
                    });

                    const appEmbed = new EmbedBuilder()
                        .setTitle(`Application Ticket: ${applicationId}`)
                        .setDescription(`Application from <@${appEntry.userId}> (ID: ${applicationId})\nType: ${appEntry.type}`)
                        .setColor('#00FFFF');

                    // include application answers if stored (we attach them to entry)
                    if (appEntry.answers) {
                        for (let i = 0; i < appEntry.answers.length; i++) {
                            appEmbed.addFields({ name: `${i + 1}. ${appEntry.questions[i]}`, value: appEntry.answers[i] || 'Skipped' });
                        }
                    }

                    const closeRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                    );

                    await ticketChannel.send({ embeds: [appEmbed], components: [closeRow] });
                    await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
                } catch (err) {
                    console.error('open_ticket_app error', err);
                    await interaction.reply({ content: 'Failed to open ticket with applicant.', ephemeral: true });
                }
                return;
            }
        }

        // ---------- Handle application modals (accept/deny with reason) ----------
        if (interaction.isModalSubmit() && (interaction.customId?.startsWith('accept_app_reason|') || interaction.customId?.startsWith('close_app_reason|'))) {
            const [action, applicationIdStr] = interaction.customId.split('|');
            const applicationId = parseInt(applicationIdStr);
            const appEntry = appsData.applications.activeApplications[applicationId];
            if (!appEntry) {
                await interaction.update({ content: 'Application not found.', components: [] });
                return;
            }
            const applicant = await client.users.fetch(appEntry.userId).catch(() => null);
            const reason = interaction.fields.getTextInputValue('reason') || '';

            if (action === 'accept_app_reason') {
                await handleAcceptanceByStaff(applicant, appEntry.type, applicationId, interaction, reason);
                return;
            } else {
                await handleDenialByStaff(applicant, appEntry.type, applicationId, interaction, reason);
                return;
            }
        }

    } catch (err) {
        console.error('interaction router error', err);
    }
});

/* =========================
   ===== Application flow ==
   ========================= */
async function startApplication(user, type) {
    try {
        const questions = QUESTIONS[type];
        const answers = [];
        let index = 0;

        // Create DM channel and start
        const dm = await user.createDM();
        await dm.send(`Application started for ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'}. You have 3 hours. Type 'cancel' to stop.`).catch(() => {});
        await dm.send(questions[index]).catch(() => {});

        const filter = m => m.author.id === user.id;
        const collector = dm.createMessageCollector({ filter, time: APPLICATION_TIMEOUT });

        collector.on('collect', async msg => {
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
            try { await dm.send(questions[index]); } catch {}
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'cancelled') {
                try { await dm.send('Your application has been cancelled.'); } catch {}
                return;
            }

            // persist application
            appsData.applications.lastApplicationId++;
            const applicationId = appsData.applications.lastApplicationId;
            appsData.applications.activeApplications[applicationId] = {
                userId: user.id,
                type,
                createdAt: Date.now(),
                answers,
                questions
            };
            saveApps();

            // send to staff channel
            const channelId = type === 'staff_app' ? APPLICATION_CHANNELS.STAFF :
                              type === 'builder_app' ? APPLICATION_CHANNELS.BUILDER :
                              APPLICATION_CHANNELS.DEV;
            const staffChannel = await client.channels.fetch(channelId).catch(() => null);

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

            if (staffChannel) staffChannel.send({ embeds: [embed], components: [buttons] }).catch(() => {});
            try { await dm.send('✅ Your application has been submitted!'); } catch {}
        });
    } catch (err) {
        console.error('startApplication error', err);
        try { await user.send('An error occurred starting your application.'); } catch {}
    }
}

/* =========================
   ===== Accept / Deny helpers
   ========================= */
async function handleAcceptanceByStaff(applicant, type, applicationId, interactionOrContext, reason) {
    // role mapping (as you asked)
    try {
        // fetch guild and member (interactionOrContext could be an interaction)
        const guild = interactionOrContext.guild || interactionOrContext.message?.guild;
        const staffMemberTag = interactionOrContext.user?.tag || (interactionOrContext.user ? interactionOrContext.user.tag : 'Staff');

        if (!guild) {
            // if called from modal submit in DM, just DM applicant
            if (applicant) await applicant.send(`✅ Your application has been accepted!${reason ? `\nReason: ${reason}` : ''}`).catch(() => {});
            if (interactionOrContext.update) await interactionOrContext.update({ content: `Application accepted by ${staffMemberTag}`, components: [] }).catch(() => {});
            return;
        }

        const member = await guild.members.fetch(applicant.id).catch(() => null);
        if (member) {
            // add roles according to type, and remove conflicting roles
            const toAdd = [];
            if (type === 'staff_app') toAdd.push(ROLES.STAFF, ROLES.TRAINEE);
            if (type === 'builder_app') toAdd.push(ROLES.STAFF, ROLES.BUILDER);
            if (type === 'dev_app') toAdd.push(ROLES.STAFF, ROLES.DEV);

            await member.roles.add(toAdd).catch(() => {});
            // remove roles that shouldn't stack
            const remove = [];
            if (type !== 'builder_app') remove.push(ROLES.BUILDER);
            if (type !== 'dev_app') remove.push(ROLES.DEV);
            if (type !== 'staff_app') remove.push(ROLES.TRAINEE);
            await member.roles.remove(remove).catch(() => {});
        }

        // DM applicant
        if (applicant) await applicant.send(`✅ Your application for ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} has been accepted!${reason ? `\nReason: ${reason}` : ''}`).catch(() => {});

        // update staff message (interaction)
        if (interactionOrContext.update) {
            await interactionOrContext.update({ content: `Application accepted by ${interactionOrContext.user.tag}${reason ? `\nReason: ${reason}` : ''}`, components: [] }).catch(() => {});
        } else if (interactionOrContext.reply) {
            await interactionOrContext.reply({ content: `Application accepted by ${interactionOrContext.user.tag}`, ephemeral: true }).catch(() => {});
        }

        // log in transcript channel (application accepted)
        const logChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('Application Accepted')
                .setDescription(`Application ID: ${applicationId}\nApplicant: ${applicant?.tag || 'Unknown'}\nBy: ${interactionOrContext.user.tag}`)
                .addFields({ name: 'Type', value: type }, { name: 'Reason', value: reason || 'None' })
                .setColor('#00FF00');
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        // archive the application (move from active to archived)
        if (appsData.applications.activeApplications[applicationId]) {
            if (!appsData.archived) appsData.archived = {};
            appsData.archived[applicationId] = Object.assign({}, appsData.applications.activeApplications[applicationId], { result: 'accepted', decidedBy: interactionOrContext.user.id, decidedAt: Date.now(), reason });
            delete appsData.applications.activeApplications[applicationId];
            saveApps();
        }
    } catch (err) {
        console.error('handleAcceptanceByStaff error', err);
    }
}

async function handleDenialByStaff(applicant, type, applicationId, interactionOrContext, reason) {
    try {
        // DM applicant
        if (applicant) await applicant.send(`❌ Your application for ${type === 'staff_app' ? 'Staff' : type === 'builder_app' ? 'Builder' : 'Dev'} has been denied.${reason ? `\nReason: ${reason}` : ''}`).catch(() => {});

        if (interactionOrContext.update) {
            await interactionOrContext.update({ content: `Application denied by ${interactionOrContext.user.tag}${reason ? `\nReason: ${reason}` : ''}`, components: [] }).catch(() => {});
        } else if (interactionOrContext.reply) {
            await interactionOrContext.reply({ content: `Application denied by ${interactionOrContext.user.tag}`, ephemeral: true }).catch(() => {});
        }

        // log in transcript channel
        const logChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('Application Denied')
                .setDescription(`Application ID: ${applicationId}\nApplicant: ${applicant?.tag || 'Unknown'}\nBy: ${interactionOrContext.user.tag}`)
                .addFields({ name: 'Type', value: type }, { name: 'Reason', value: reason || 'None' })
                .setColor('#FF0000');
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        // archive the application
        if (appsData.applications.activeApplications[applicationId]) {
            if (!appsData.archived) appsData.archived = {};
            appsData.archived[applicationId] = Object.assign({}, appsData.applications.activeApplications[applicationId], { result: 'denied', decidedBy: interactionOrContext.user.id, decidedAt: Date.now(), reason });
            delete appsData.applications.activeApplications[applicationId];
            saveApps();
        }
    } catch (err) {
        console.error('handleDenialByStaff error', err);
    }
}

/* =========================
   ===== Start Bot =========
   ========================= */
client.login(process.env.TOKEN);
