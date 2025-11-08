require('dotenv').config();
const fs = require('fs');
const { 
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionsBitField, EmbedBuilder, Collection, StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const STAFF_ROLE_ID = '1434722988602822762';
const TICKET_CATEGORY_ID = '1434722990054051957';
const PANEL_CHANNEL_ID = '1434722989571575984';

let ticketsData = JSON.parse(fs.readFileSync('./tickets.json', 'utf8'));
const activeCollectors = new Collection();

client.once('ready', async () => {
    console.log(`Ticket Bot online as ${client.user.tag}`);

    // Register /add command
    const data = [
        {
            name: 'add',
            description: 'Add a user to the ticket',
            options: [
                {
                    type: 6, // USER type
                    name: 'user',
                    description: 'User to add',
                    required: true
                }
            ]
        }
    ];
    await client.guilds.cache.forEach(guild => guild.commands.set(data));
});

// Admin command to send ticket panel
client.on('messageCreate', async message => {
    if (message.content === '!tickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('Support Tickets')
            .setDescription('Click the button below to create a ticket.\n**Pinging staff will result in a blacklist**')
            .setColor('#00FFFF');

        const ticketButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('player_report').setLabel('Player Report').setStyle(ButtonStyle.Danger).setEmoji('🎮'),
            new ButtonBuilder().setCustomId('bug_report').setLabel('Bug Report').setStyle(ButtonStyle.Primary).setEmoji('🐛'),
            new ButtonBuilder().setCustomId('staff_report').setLabel('Staff Report').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
            new ButtonBuilder().setCustomId('billing_issue').setLabel('Billing Issue').setStyle(ButtonStyle.Success).setEmoji('💰'),
            new ButtonBuilder().setCustomId('punishment_appeal').setLabel('Punishment Appeal').setStyle(ButtonStyle.Secondary).setEmoji('⚖️')
        );

        const channel = message.guild.channels.cache.get(PANEL_CHANNEL_ID);
        if (channel) channel.send({ embeds: [embed], components: [ticketButtons] });
        else message.channel.send('Panel channel not found.');
    }
});

// Button interaction for ticket creation
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const guild = interaction.guild;
    const member = interaction.user;

    const ticketTypes = {
        player_report: 'Player Report',
        bug_report: 'Bug Report',
        staff_report: 'Staff Report',
        billing_issue: 'Billing Issue',
        punishment_appeal: 'Punishment Appeal'
    };

    const ticketType = ticketTypes[interaction.customId];
    if (!ticketType) return;

    // Increment ticket number
    ticketsData.lastTicket++;
    fs.writeFileSync('./tickets.json', JSON.stringify(ticketsData, null, 4));
    const ticketNumber = ticketsData.lastTicket;
    const ticketName = `Ticket-${ticketNumber}`;

    // Create ticket channel
    const ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID,
        permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
    });

    // Welcome embed
    const welcomeEmbed = new EmbedBuilder()
        .setTitle(`${ticketName} Opened`)
        .setDescription(`<@${member.id}> Thank you for contacting support, a staff member will be with you soon.`)
        .setColor('#00FFFF');
    await ticketChannel.send({ embeds: [welcomeEmbed] });

    await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });

    // Mandatory questions
    const questions = ['What is your IGN?', 'What is your Issue?'];
    const answers = [];
    ticketChannel.send({ content: `<@${member.id}> Please answer the following questions:` });

    const filter = m => m.author.id === member.id;
    const collector = ticketChannel.createMessageCollector({ filter, max: questions.length, time: 600000 });
    activeCollectors.set(ticketChannel.id, collector);

    let questionIndex = 0;
    ticketChannel.send(questions[questionIndex]);

    collector.on('collect', async msg => {
        answers.push(msg.content);
        questionIndex++;
        if (questionIndex < questions.length) {
            ticketChannel.send(questions[questionIndex]);
        } else {
            const infoEmbed = new EmbedBuilder()
                .setTitle(`🎫 ${ticketName}`)
                .setDescription(`<@${member.id}>`)
                .addFields(
                    { name: 'IGN', value: answers[0] },
                    { name: 'Issue', value: answers[1] }
                )
                .setColor('#00FFFF');

            // Dropdown menu for closing
            const closeMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_actions')
                    .setPlaceholder('Select an action')
                    .addOptions([
                        {
                            label: 'Close Ticket',
                            description: 'Close this ticket',
                            value: 'close_ticket',
                            emoji: '🔒'
                        }
                    ])
            );

            await ticketChannel.send({ embeds: [infoEmbed], components: [closeMenu] });
            collector.stop();
            activeCollectors.delete(ticketChannel.id);
        }
    });

    collector.on('end', collected => {
        if (collected.size < questions.length) ticketChannel.send('Ticket creation timed out.');
    });
});

// Handle dropdown select menu interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'ticket_actions') return;

    const ticketChannel = interaction.channel;
    const staffMember = interaction.user;

    if (interaction.values[0] === 'close_ticket') {
        await interaction.reply({ content: 'Closing ticket...', ephemeral: true });

        const ticketCreator = ticketChannel.members.filter(m => !m.user.bot).first();
        if (ticketCreator) {
            const closedEmbed = new EmbedBuilder()
                .setTitle('🔒 Your Ticket Was Closed')
                .setDescription(`Your support ticket in **Coralises Network | OCE** has been closed by ${staffMember.tag}.\n🎫 **${ticketChannel.name}** • Server: Coralises Network | OCE • Closed by ${staffMember.tag}\n📅 <t:${Math.floor(Date.now()/1000)}:f>`)
                .setColor('#FF0000');

            try { await ticketCreator.send({ embeds: [closedEmbed] }); } catch {}
        }

        await ticketChannel.delete().catch(() => {});
    }
});

// /add command usable by any member
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
