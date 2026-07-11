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
