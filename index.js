require('dotenv').config();
const fs = require('fs');
const {
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionsBitField, EmbedBuilder, Collection, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

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

// HANDLE DROPDOWN INTERACTION -> SHOW MODAL
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'ticket_type_select') return;

    try {
        const member = interaction.user;
        const ticketType = interaction.values[0];

        ticketsData.lastTicket++;
        fs.writeFileSync('./tickets.json', JSON.stringify(ticketsData, null, 4));
        const ticketNumber = ticketsData.lastTicket;

        // Create ticket channel
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

        // Show modal for ticket info
        const modal = new ModalBuilder()
            .setCustomId(`ticket_modal_${ticketNumber}`)
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
    } catch (error) {
        console.error('[ERROR] Dropdown interaction failed:', error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
        }
    }
});

// HANDLE MODAL SUBMIT
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('ticket_modal_')) return;

    try {
        const member = interaction.user;
        const ticketNumber = interaction.customId.split('_')[2];

        // Get the ticket channel
        const ticketChannel = interaction.guild.channels.cache.find(ch => ch.name === `Ticket-${ticketNumber}`);
        if (!ticketChannel) {
            console.log(`[ERROR] Ticket channel not found for Ticket-${ticketNumber}`);
            return interaction.reply({ content: 'Error: Ticket channel not found!', ephemeral: true });
        }

        // Get modal inputs
        const ign = interaction.fields.getTextInputValue('ign_input');
        const issue = interaction.fields.getTextInputValue('issue_input');

        // Close button
        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        // Embed for ticket
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Ticket-${ticketNumber}`)
            .setDescription(`<@${member.id}> Thank you for contacting support, a staff member will be with you soon.`)
            .addFields(
                { name: 'IGN', value: ign },
                { name: 'Issue', value: issue }
            )
            .setColor('#00FFFF');

        // Send embed to ticket channel
        await ticketChannel.send({ embeds: [embed], components: [closeButton] });

        // Reply to user to acknowledge the modal
        await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
        console.log(`[INFO] Ticket-${ticketNumber} created by ${member.tag}`);
        
    } catch (error) {
        console.error('[ERROR] Modal submit failed:', error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'An error occurred while creating your ticket. Please try again.', ephemeral: true });
        }
    }
});

// CLOSE BUTTON
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'close_ticket') return;

    const ticketChannel = interaction.channel;
    const staffMember = interaction.user;

    await interaction.reply({ content: 'Closing ticket...', ephemeral: true });

    // DM ticket opener
    const ticketCreator = ticketChannel.members.filter(m => !m.user.bot).first();
    if (ticketCreator) {
        const closedEmbed = new EmbedBuilder()
            .setTitle('🔒 Your Ticket Was Closed')
            .setDescription(`Your support ticket in **Coralises Network | OCE** has been closed by ${staffMember.tag}.\n🎫 **${ticketChannel.name}**\n📅 <t:${Math.floor(Date.now()/1000)}:f>`)
            .setColor('#FF0000');
        try { await ticketCreator.send({ embeds: [closedEmbed] }); } catch {}
    }

    // Transcript
    const messages = await ticketChannel.messages.fetch({ limit: 100 });
    const transcript = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');

    const transcriptChannel = interaction.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
    if (transcriptChannel) {
        transcriptChannel.send({ content: `Transcript for **${ticketChannel.name}**:\n\`\`\`${transcript}\`\`\`` });
    }

    await ticketChannel.delete().catch(() => {});
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

client.login(process.env.TOKEN);
