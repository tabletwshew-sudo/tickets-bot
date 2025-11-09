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
