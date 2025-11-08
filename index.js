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

// CONFIG
const STAFF_ROLE_ID = '1434722988602822762';
const TICKET_CATEGORY_ID = '1434722990054051957';
const PANEL_CHANNEL_ID = '1434722989571575984';

let ticketsData = JSON.parse(fs.readFileSync('./tickets.json', 'utf8'));
const activeCollectors = new Collection();

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

// HANDLE TICKET CREATION
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    // TICKET TYPE SELECT
    if (interaction.customId === 'ticket_type_select') {
        const member = interaction.user;
        const ticketType = interaction.values[0];

        ticketsData.lastTicket++;
        fs.writeFileSync('./tickets.json', JSON.stringify(ticketsData, null, 4));
        const ticketNumber = ticketsData.lastTicket;
        const ticketName = `Ticket-${ticketNumber}`;

        const ticketChannel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        // Close dropdown at top
        const closeMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_actions')
                .setPlaceholder('Ticket Actions')
                .addOptions([
                    { label: 'Close Ticket', value: 'close_ticket', emoji: '🔒' }
                ])
        );

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`${ticketName} Opened`)
            .setDescription(`<@${member.id}> Thank you for contacting support, a staff member will be with you soon.`)
            .setColor('#00FFFF');

        await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeMenu] });
        await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });

        // QUESTIONS
        const questions = ['What is your IGN?', 'What is your Issue?'];
        const answers = [];
        ticketChannel.send({ content: `<@${member.id}> Please answer the following questions:` });

        const filter = m => m.author.id === member.id;
        const collector = ticketChannel.createMessageCollector({ filter, max: questions.length, time: 600000 });
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
                        { name: 'Issue', value: answers[1] },
                        { name: 'Ticket Type', value: ticketType.replace(/_/g,' ') }
                    )
                    .setColor('#00FFFF');

                await ticketChannel.send({ embeds: [infoEmbed] });
                collector.stop();
            }
        });
    }

    // CLOSE TICKET DROPDOWN
    if (interaction.customId === 'ticket_actions' && interaction.values[0] === 'close_ticket') {
        const ticketChannel = interaction.channel;
        const staffMember = interaction.user;
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
