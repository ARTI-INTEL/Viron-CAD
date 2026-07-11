/**
 * index.js  Ultimate CAD – Discord Bot
 *
 * Standalone Discord bot process that provides slash commands and
 * department role-syncing for the Ultimate CAD system.
 *
 * ── Architecture ─────────────────────────────────────────────────
 * The bot runs as a SEPARATE Node process (not bolted onto server.js)
 * because discord.js's Gateway connection is long-lived and stateful.
 * This keeps your Express app's dependency tree clean and avoids
 * restarts on every file save during `npm run dev`.
 *
 * ── How it talks to your CAD data ────────────────────────────────
 * Instead of giving the bot direct MySQL access, it calls internal
 * REST endpoints on the main CAD server at /bot-api/*, protected by
 * a shared secret (DISCORD_BOT_SECRET). This keeps business logic
 * (permission checks, JSON parsing, etc.) in one place.
 *
 * ── Setup ────────────────────────────────────────────────────────
 * 1. Set DISCORD_BOT_SECRET in both the main CAD .env and discord-bot/.env
 * 2. Set CAD_API_BASE to your CAD server's public URL
 * 3. Run:  node deploy-commands.js   (one-time slash command registration)
 * 4. Run:  node index.js             (start the bot)
 */

import { Client, GatewayIntentBits, Events, EmbedBuilder, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE    = process.env.CAD_API_BASE;    // e.g. https://your-cad-domain.com
const BOT_SECRET  = process.env.DISCORD_BOT_SECRET;

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Fetch a bot-only endpoint from the main CAD server.
 * The shared secret is sent as the x-bot-secret header.
 */
async function botFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-bot-secret': BOT_SECRET },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.substring(0, 120)}`);
  }
  return res.json();
}

/* ── Bot client setup ─────────────────────────────────────────── */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // If you add role-sync later, you'll also need:
    // GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Ultimate CAD Bot logged in as ${client.user.tag}`);
  console.log(`   API base: ${API_BASE}`);
});

/* ── Slash command handler ────────────────────────────────────── */

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  /* ── /link ───────────────────────────────────────────────────
   *  Check if the user's Discord account is linked to a CAD user.
   *  Linking happens automatically during Discord OAuth login.
   */
  if (interaction.commandName === 'link') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const data = await botFetch(`/bot-api/link-status/${interaction.user.id}`);
      await interaction.editReply({
        content: data
          ? `✅ Linked to CAD account **${data.username}**.`
          : `❌ Not linked. Log in to Ultimate CAD with Discord to link automatically.`,
      });
    } catch (err) {
      await interaction.editReply({
        content: `⚠️ Could not check link status: ${err.message}`,
      });
    }
  }

  /* ── /units ──────────────────────────────────────────────────
   *  Show all currently active (clocked-in) units for the CAD
   *  server that is linked to this Discord guild.
   */
  if (interaction.commandName === 'units') {
    await interaction.deferReply();

    try {
      const units = await botFetch(`/bot-api/units/${interaction.guildId}`);

      const embed = new EmbedBuilder()
        .setTitle('🚔 Active Units')
        .setColor(0x2954c3)
        .setDescription(
          units.length
            ? units.map((u) => `**${u.callsign}** — ${u.department} (${u.status})`).join('\n')
            : 'No units currently on duty.'
        )
        .setFooter({ text: 'Ultimate CAD' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        content: `⚠️ ${err.message}`,
      });
    }
  }

  /* ── /server-link ───────────────────────────────────────────
   *  Check if this Discord guild is linked to an Ultimate CAD server.
   *  The link is set via the CAD web UI (Server Settings → Discord Server ID).
   */
  if (interaction.commandName === 'server-link') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const server = await botFetch(`/bot-api/server-link/${interaction.guildId}`);

      const embed = new EmbedBuilder()
        .setTitle('✅ Linked CAD Server')
        .setColor(0x57f287)
        .setDescription(
          `This Discord server is linked to **${server.name}**.`
        )
        .addFields(
          { name: 'Server ID', value: `\`${server.idserver}\``, inline: true },
          { name: 'Join Code', value: `\`${server.join_code}\``, inline: true },
          { name: 'Description', value: server.description || '*No description set*' }
        )
        .setFooter({ text: 'Ultimate CAD' })
        .setTimestamp();

      if (server.icon_url) {
        embed.setThumbnail(server.icon_url);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      // 404 from the API means no server linked
      if (err.message.includes('404')) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No CAD Server Linked')
          .setColor(0xed4245)
          .setDescription(
            'This Discord server is **not** linked to any Ultimate CAD server.\n\n' +
            'To link one:\n' +
            '1. Open **Ultimate CAD** in your browser\n' +
            '2. Go to **Server Settings** for your CAD server\n' +
            '3. Paste this Discord server\'s ID into the **Discord Server ID** field\n' +
            '4. Save settings'
          )
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `⚠️ Could not check server link: ${err.message}`,
        });
      }
    }
  }

  /* ── /members ───────────────────────────────────────────────
   *  List all members of the CAD server linked to this Discord guild.
   *  Shows the owner first, then all other members sorted by join date.
   */
  if (interaction.commandName === 'members') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const data = await botFetch(`/bot-api/members/${interaction.guildId}`);

      /* Build the member list as a string, handling Discord's 1024-char field limit */
      let ownerLine = '';
      const memberLines = [];

      data.members.forEach((m) => {
        const discordMention = m.discord_id ? ` <@${m.discord_id}>` : '';
        const line = m.role === 'Owner'
          ? `👑 **${m.username}**${discordMention}`
          : `👤 **${m.username}**${discordMention}`;

        if (m.role === 'Owner') {
          ownerLine = line;
        } else {
          memberLines.push(line);
        }
      });

      const embed = new EmbedBuilder()
        .setTitle(`👥 Members — ${data.serverName}`)
        .setColor(0x5865f2);

      if (ownerLine) {
        embed.addFields({ name: '👑 Owner', value: ownerLine });
      }

      /* Split members into fields of at most ~20 entries (fitting within 1024 chars) */
      if (memberLines.length > 0) {
        const CHUNK_SIZE = 20;
        const chunks = [];
        for (let i = 0; i < memberLines.length; i += CHUNK_SIZE) {
          chunks.push(memberLines.slice(i, i + CHUNK_SIZE));
        }
        chunks.forEach((chunk, idx) => {
          const label = chunks.length === 1
            ? '👤 Members'
            : `👤 Members (${idx * CHUNK_SIZE + 1}–${Math.min((idx + 1) * CHUNK_SIZE, memberLines.length)})`;
          embed.addFields({ name: label, value: chunk.join('\n').substring(0, 1024) });
        });
      }

      embed
        .setFooter({ text: `${data.members.length} member${data.members.length !== 1 ? 's' : ''} total • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err.message.includes('404')) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No CAD Server Linked')
          .setColor(0xed4245)
          .setDescription(
            'This Discord server is **not** linked to any Ultimate CAD server.\n\n' +
            'Use `/server-link` for setup instructions.'
          )
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `⚠️ Could not fetch members: ${err.message}`,
        });
      }
    }
  }

  /* ── /calls ─────────────────────────────────────────────────-
   *  Show all active calls for the linked CAD server.
   *  Public response (not ephemeral) since calls are ops-relevant.
   */
  if (interaction.commandName === 'calls') {
    await interaction.deferReply();

    try {
      const calls = await botFetch(`/bot-api/calls/${interaction.guildId}`);

      if (!calls.length) {
        await interaction.editReply({ content: '✅ No active calls.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📞 Active Calls')
        .setColor(0xfee75c);

      calls.slice(0, 10).forEach((call) => {
        const unitText = call.units ? `\n📡 Assigned: ${call.units}` : '';
        embed.addFields({
          name: `#${call.id} — ${call.nature} (${call.priority})`,
          value: `📍 ${call.location}${unitText}\n🕐 <t:${Math.floor(new Date(call.created_at).getTime() / 1000)}:R>`,
        });
      });

      if (calls.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${calls.length} active calls • Ultimate CAD` });
      } else {
        embed.setFooter({ text: `${calls.length} active call${calls.length !== 1 ? 's' : ''} • Ultimate CAD` });
      }
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /deployments ───────────────────────────────────────────
   *  Show each active call with the units assigned to it.
   *  Public response — dispatch ops awareness.
   */
  if (interaction.commandName === 'deployments') {
    await interaction.deferReply();

    try {
      const data = await botFetch(`/bot-api/deployments/${interaction.guildId}`);

      if (!data.totalCalls) {
        await interaction.editReply({ content: '✅ No active deployments.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📡 Active Deployments')
        .setColor(0x2954c3);

      data.deployments.slice(0, 8).forEach((call) => {
        const unitLines = call.units.length
          ? call.units.map(
              (u) => `‣ **${u.callsign}** — ${u.department} (${u.status || 'Available'})`
            ).join('\n')
          : '*No units assigned*';

        embed.addFields({
          name: `#${call.call_id} — ${call.nature} (${call.priority})`,
          value: `📍 ${call.location}\n🚔 ${unitLines}\n🕐 <t:${Math.floor(new Date(call.created_at).getTime() / 1000)}:R>`,
        });
      });

      const totalDeployed = data.deployments.reduce((sum, c) => sum + c.units.length, 0);

      embed
        .setFooter({
          text: `${data.totalCalls} call${data.totalCalls !== 1 ? 's' : ''} • ${totalDeployed} unit${totalDeployed !== 1 ? 's' : ''} deployed • Ultimate CAD`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /bolos ──────────────────────────────────────────────────
   *  Show all active BOLOs for the linked CAD server.
   *  Public response — useful for dispatch awareness.
   */
  if (interaction.commandName === 'bolos') {
    await interaction.deferReply();

    try {
      const bolos = await botFetch(`/bot-api/bolos/${interaction.guildId}`);

      if (!bolos.length) {
        await interaction.editReply({ content: '✅ No active BOLOs.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Active BOLOs')
        .setColor(0xed4245)
        .setDescription(
          bolos.slice(0, 15).map(
            (b) => `**${b.type}** — ${b.reason}\n${b.description.substring(0, 200)}`
          ).join('\n\n')
        )
        .setFooter({ text: `${bolos.length} active BOLO${bolos.length !== 1 ? 's' : ''} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /onduty ────────────────────────────────────────────────
   *  Check if a specific Discord user is clocked in.
   *  Ephemeral — personal status check.
   */
  if (interaction.commandName === 'onduty') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user');

    try {
      const unit = await botFetch(`/bot-api/onduty/${interaction.guildId}/${targetUser.id}`);

      if (unit) {
        const embed = new EmbedBuilder()
          .setTitle('✅ On Duty')
          .setColor(0x57f287)
          .setDescription(
            `${targetUser} is currently clocked in as **${unit.callsign}**` +
            ` — ${unit.department} (${unit.status || 'Available'})` +
            (unit.current_call ? `\n📞 On call #${unit.current_call}` : '')
          )
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('❌ Off Duty')
          .setColor(0x808080)
          .setDescription(`${targetUser} is not currently clocked in.`)
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /dept-roster ───────────────────────────────────────────
   *  Show members + ranks for a specific department.
   *  Ephemeral — doesn't need to be public.
   */
  if (interaction.commandName === 'dept-roster') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const deptName = interaction.options.getString('department');

    try {
      const data = await botFetch(`/bot-api/dept-roster/${interaction.guildId}?deptName=${encodeURIComponent(deptName)}`);

      if (!data.members.length) {
        await interaction.editReply({ content: `No members found in **${data.deptName}**.` });
        return;
      }

      const memberList = data.members.map((m) => {
        const mention = m.discord_id ? ` <@${m.discord_id}>` : '';
        return `**${m.rank_name || 'No Rank'}** — ${m.username}${mention}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${data.deptName} Roster`)
        .setColor(0x5865f2)
        .setDescription(memberList.join('\n').substring(0, 4000))
        .addFields({ name: 'Type', value: data.deptType, inline: true })
        .setFooter({ text: `${data.members.length} member${data.members.length !== 1 ? 's' : ''} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /infractions ───────────────────────────────────────────
   *  Show infraction history for a Discord user.
   *  Ephemeral — contains PII.
   *  Restricted to LEO/Dispatch role if LEO_DISCORD_ROLE_ID is set.
   */
  if (interaction.commandName === 'infractions') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Check LEO/Dispatch role if configured
    const leoRoleId = process.env.LEO_DISCORD_ROLE_ID;
    if (leoRoleId && !interaction.member.roles.cache.has(leoRoleId)) {
      await interaction.editReply({
        content: '🔒 This command is restricted to LEO/Dispatch personnel.',
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');

    try {
      const data = await botFetch(`/bot-api/infractions/${interaction.guildId}/${targetUser.id}`);

      if (!data.total) {
        await interaction.editReply({ content: `✅ **${targetUser.username}** has no infractions on record.` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 Infractions — ${targetUser.username}`)
        .setColor(0xe67e22)
        .setDescription(
          data.infractions.slice(0, 15).map(
            (inf) => `**${inf.dept_name}** — ${inf.reason}\n🕐 <t:${Math.floor(new Date(inf.created_at).getTime() / 1000)}:R>${inf.given_by_name ? ` • By ${inf.given_by_name}` : ''}`
          ).join('\n\n')
        )
        .setFooter({ text: `${data.total} infraction${data.total !== 1 ? 's' : ''} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /activity ──────────────────────────────────────────────
   *  Show weekly activity stats for a Discord user.
   *  Ephemeral — PII.
   */
  if (interaction.commandName === 'activity') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user');

    try {
      const stats = await botFetch(`/bot-api/activity/${interaction.guildId}/${targetUser.id}`);

      if (!stats.length) {
        await interaction.editReply({ content: `📊 **${targetUser.username}** has no activity logged in the past 7 days.` });
        return;
      }

      const total = stats.reduce((sum, s) => sum + s.activity_count, 0);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Activity — ${targetUser.username}`)
        .setColor(0x9b59b6)
        .setDescription(
          stats.map(
            (s) => `**${s.dept_name}** (${s.dept_type}) — ${s.activity_count} action${s.activity_count !== 1 ? 's' : ''}`
          ).join('\n')
        )
        .setFooter({ text: `${total} total actions in 7 days • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /audit-log ─────────────────────────────────────────────
   *  Show recent audit events. Owner-only.
   *  Ephemeral — contains sensitive server ops info.
   */
  if (interaction.commandName === 'audit-log') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const limit = interaction.options.getInteger('limit') || 15;

    try {
      const data = await botFetch(`/bot-api/audit-log/${interaction.guildId}?limit=${limit}&discordId=${interaction.user.id}`);

      const embed = new EmbedBuilder()
        .setTitle('📜 Audit Log')
        .setColor(0x2c3e50)
        .setDescription(
          data.events.length
            ? data.events.map(
                (e) => `**${e.action}** — ${e.username}\n🕐 <t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:R>`
              ).join('\n\n')
            : 'No audit events found.'
        )
        .setFooter({ text: `${data.total} total events • Showing last ${data.events.length} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err.message.includes('403')) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Restricted')
          .setColor(0xed4245)
          .setDescription(
            'Only the **CAD server owner** can view the audit log.\n\n' +
            'If you are the owner, make sure your Discord account is linked ' +
            'to your CAD account by logging into Ultimate CAD with Discord.'
          )
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: `⚠️ ${err.message}` });
      }
    }
  }

  /* ── /join-code ─────────────────────────────────────────────
   *  Show the server join code. Owner-only.
   *  Ephemeral — the code is a server secret.
   */
  if (interaction.commandName === 'join-code') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const data = await botFetch(`/bot-api/join-code/${interaction.guildId}?discordId=${interaction.user.id}`);

      const embed = new EmbedBuilder()
        .setTitle('🔑 Join Code')
        .setColor(0x57f287)
        .setDescription(`**${data.serverName}**\n\`${data.joinCode}\``)
        .setFooter({ text: 'Share this code with new members • Ultimate CAD' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err.message.includes('403')) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Restricted')
          .setColor(0xed4245)
          .setDescription(
            'Only the **CAD server owner** can view the join code.\n\n' +
            'If you are the owner, make sure your Discord account is linked ' +
            'to your CAD account by logging into Ultimate CAD with Discord.'
          )
          .setFooter({ text: 'Ultimate CAD' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: `⚠️ ${err.message}` });
      }
    }
  }

  /* ── /lookup-plate ──────────────────────────────────────────
   *  Look up a vehicle by plate number.
   *  Ephemeral — PII from CAD records.
   */
  if (interaction.commandName === 'lookup-plate') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const plate = interaction.options.getString('plate');

    // Check LEO/Dispatch role if configured
    const leoRoleId = process.env.LEO_DISCORD_ROLE_ID;
    if (leoRoleId && !interaction.member.roles.cache.has(leoRoleId)) {
      await interaction.editReply({
        content: '🔒 This command is restricted to LEO/Dispatch personnel.',
      });
      return;
    }

    try {
      const vehicles = await botFetch(`/bot-api/lookup/plate/${interaction.guildId}/${encodeURIComponent(plate)}`);

      if (!vehicles.length) {
        await interaction.editReply({ content: `❌ No vehicles found matching plate **${plate}**.` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚗 Plate Lookup — ${plate.toUpperCase()}`)
        .setColor(0x3498db);

      vehicles.slice(0, 5).forEach((v) => {
        embed.addFields({
          name: `${v.plate} — ${v.model || 'Unknown'} (${v.color || 'N/A'})`,
          value: `👤 **${v.owner_name || 'No owner'}**\n${v.registered ? '✅ Registered' : '❌ Unregistered'}`,
        });
      });

      embed
        .setFooter({ text: `${vehicles.length} result${vehicles.length !== 1 ? 's' : ''} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /lookup-person ─────────────────────────────────────────
   *  Look up a person by name.
   *  Ephemeral — PII from CAD records.
   */
  if (interaction.commandName === 'lookup-person') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString('name');

    // Check LEO/Dispatch role if configured
    const leoRoleId = process.env.LEO_DISCORD_ROLE_ID;
    if (leoRoleId && !interaction.member.roles.cache.has(leoRoleId)) {
      await interaction.editReply({
        content: '🔒 This command is restricted to LEO/Dispatch personnel.',
      });
      return;
    }

    try {
      const persons = await botFetch(`/bot-api/lookup/person/${interaction.guildId}/${encodeURIComponent(name)}`);

      if (!persons.length) {
        await interaction.editReply({ content: `❌ No persons found matching **${name}**.` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 Person Lookup`)
        .setColor(0x3498db)
        .setDescription(
          persons.slice(0, 5).map((p) => {
            let text = `**${p.first_name} ${p.last_name}**`;
            if (p.dob) text += `\n📅 DOB: ${new Date(p.dob).toLocaleDateString()}`;
            if (p.address) text += `\n📍 ${p.address}`;
            if (p.phone) text += `\n📞 ${p.phone}`;
            if (p.notes) text += `\n📝 ${p.notes}`;
            if (p.vehicles?.length) text += `\n🚗 ${p.vehicles.map((v) => v.plate).join(', ')}`;
            if (p.firearms?.length) text += `\n🔫 ${p.firearms.length} firearm${p.firearms.length !== 1 ? 's' : ''}`;
            return text;
          }).join('\n\n')
        )
        .setFooter({ text: `${persons.length} result${persons.length !== 1 ? 's' : ''} • Ultimate CAD` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
    }
  }

  /* ── /dept-role-sync (placeholder for future use) ────────────
   *  The endpoint /bot-api/dept-role-sync/:discordGuildId already
   *  exists on the API. This command can be wired up once the bot
   *  has GuildMembers intent and appropriate role-management perms.
   */
  if (interaction.commandName === 'dept-role-sync') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const members = await botFetch(`/bot-api/dept-role-sync/${interaction.guildId}`);

      if (!members.length) {
        await interaction.editReply({ content: 'No department members found for role sync.' });
        return;
      }

      // Group by department for a clean display
      const deptGroups = {};
      members.forEach((m) => {
        const key = `${m.dept_name} (${m.dept_type})`;
        if (!deptGroups[key]) deptGroups[key] = [];
        deptGroups[key].push(`${m.rank_name || 'No Rank'} — <@${m.discord_id}>`);
      });

      const description = Object.entries(deptGroups)
        .map(([dept, lines]) => `**${dept}**\n${lines.slice(0, 15).join('\n')}`)
        .join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📋 Department Role Sync')
        .setColor(0x5865f2)
        .setDescription(description.substring(0, 4000))
        .setFooter({ text: `${members.length} members across ${Object.keys(deptGroups).length} departments` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        content: `⚠️ ${err.message}`,
      });
    }
  }
});

/* ── Login ─────────────────────────────────────────────────────── */

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('❌ DISCORD_BOT_TOKEN is not set. Create a .env file (see .env.example).');
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error('❌ Failed to login:', err.message);
  process.exit(1);
});
