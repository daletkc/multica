#!/usr/bin/env node
/**
 * Skills CLI
 *
 * Command-line interface for managing skills
 *
 * Usage:
 *   pnpm skills:cli list              List all skills
 *   pnpm skills:cli status [id]       Show skill status
 *   pnpm skills:cli install <id>      Install skill dependencies
 */

import {
  SkillManager,
  installSkill,
  getInstallOptions,
} from "./skills/index.js";

// ============================================================================
// Types
// ============================================================================

type Command = "list" | "status" | "install" | "help";

interface ParsedArgs {
  command: Command;
  args: string[];
  verbose: boolean;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let verbose = false;
  const positional: string[] = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;

    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { command: "help", args: [], verbose };
    }

    positional.push(arg);
  }

  const command = (positional[0] ?? "help") as Command;
  const commandArgs = positional.slice(1);

  return { command, args: commandArgs, verbose };
}

// ============================================================================
// Commands
// ============================================================================

function printHelp(): void {
  console.log(`
Skills CLI - Manage super-multica skills

Usage:
  pnpm skills:cli <command> [options]

Commands:
  list              List all available skills
  status [id]       Show detailed status of a skill (or all skills)
  install <id>      Install dependencies for a skill

Options:
  -v, --verbose     Show more details
  -h, --help        Show this help

Examples:
  pnpm skills:cli list
  pnpm skills:cli status commit
  pnpm skills:cli install nano-pdf
`);
}

function cmdList(manager: SkillManager, verbose: boolean): void {
  const skills = manager.listAllSkillsWithStatus();

  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log("\nAvailable Skills:\n");

  for (const skill of skills) {
    const status = skill.eligible ? "✓" : "✗";
    const statusColor = skill.eligible ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(`  ${statusColor}${status}${reset} ${skill.emoji} ${skill.name} (${skill.id})`);
    console.log(`    ${skill.description}`);
    console.log(`    Source: ${skill.source}`);

    if (!skill.eligible && skill.reasons) {
      for (const reason of skill.reasons) {
        console.log(`    ${statusColor}└ ${reason}${reset}`);
      }
    }

    if (verbose) {
      console.log();
    }
  }

  console.log();
  const eligibleCount = skills.filter((s) => s.eligible).length;
  console.log(`Total: ${skills.length} skills (${eligibleCount} eligible)`);
}

function cmdStatus(manager: SkillManager, skillId?: string): void {
  if (!skillId) {
    // Show summary status
    const skills = manager.listAllSkillsWithStatus();
    const eligible = skills.filter((s) => s.eligible);
    const ineligible = skills.filter((s) => !s.eligible);

    console.log("\nSkills Status Summary:\n");
    console.log(`  Total:      ${skills.length}`);
    console.log(`  Eligible:   ${eligible.length}`);
    console.log(`  Ineligible: ${ineligible.length}`);

    if (ineligible.length > 0) {
      console.log("\nIneligible Skills:");
      for (const s of ineligible) {
        console.log(`  - ${s.id}: ${s.reasons?.join(", ") ?? "unknown reason"}`);
      }
    }
    return;
  }

  // Show specific skill status
  const skill = manager.getSkillFromAll(skillId);
  if (!skill) {
    console.error(`Skill not found: ${skillId}`);
    process.exit(1);
  }

  const eligibility = manager.checkSkillEligibility(skillId);
  const metadata = skill.frontmatter.metadata;

  console.log(`\n${metadata?.emoji ?? "🔧"} ${skill.frontmatter.name}`);
  console.log("─".repeat(40));
  console.log(`ID:          ${skill.id}`);
  console.log(`Description: ${skill.frontmatter.description ?? "N/A"}`);
  console.log(`Version:     ${skill.frontmatter.version ?? "N/A"}`);
  console.log(`Source:      ${skill.source}`);
  console.log(`Path:        ${skill.filePath}`);
  console.log(`Homepage:    ${skill.frontmatter.homepage ?? metadata?.homepage ?? "N/A"}`);

  console.log();
  console.log(`Eligible: ${eligibility?.eligible ? "\x1b[32m✓ Yes\x1b[0m" : "\x1b[31m✗ No\x1b[0m"}`);

  if (!eligibility?.eligible && eligibility?.reasons) {
    console.log("Reasons:");
    for (const reason of eligibility.reasons) {
      console.log(`  - ${reason}`);
    }
  }

  // Show requirements
  if (metadata?.requires || metadata?.requiresBinaries || metadata?.requiresEnv) {
    console.log("\nRequirements:");
    const bins = metadata.requires?.bins ?? metadata.requiresBinaries ?? [];
    const anyBins = metadata.requires?.anyBins ?? [];
    const envs = metadata.requires?.env ?? metadata.requiresEnv ?? [];

    if (bins.length > 0) {
      console.log(`  Binaries: ${bins.join(", ")}`);
    }
    if (anyBins.length > 0) {
      console.log(`  Any of: ${anyBins.join(", ")}`);
    }
    if (envs.length > 0) {
      console.log(`  Environment: ${envs.join(", ")}`);
    }
  }

  // Show install options
  const installOptions = getInstallOptions(skill);
  if (installOptions.length > 0) {
    console.log("\nInstall Options:");
    for (const opt of installOptions) {
      const status = opt.available ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      console.log(`  ${status} [${opt.id}] ${opt.label}`);
      if (!opt.available && opt.reason) {
        console.log(`    └ ${opt.reason}`);
      }
    }
  }
}

async function cmdInstall(manager: SkillManager, skillId: string, installId?: string): Promise<void> {
  const skill = manager.getSkillFromAll(skillId);
  if (!skill) {
    console.error(`Skill not found: ${skillId}`);
    process.exit(1);
  }

  const installOptions = getInstallOptions(skill);
  if (installOptions.length === 0) {
    console.error(`Skill '${skillId}' has no install specifications.`);
    process.exit(1);
  }

  // Show available options if multiple
  if (!installId && installOptions.length > 1) {
    console.log(`\nMultiple install options available for '${skillId}':\n`);
    for (const opt of installOptions) {
      const status = opt.available ? "available" : `unavailable: ${opt.reason}`;
      console.log(`  [${opt.id}] ${opt.label} (${status})`);
    }
    console.log(`\nUse: pnpm skills:cli install ${skillId} <install-id>`);
    return;
  }

  console.log(`\nInstalling dependencies for '${skillId}'...`);

  const result = await installSkill({
    skill,
    installId,
  });

  if (result.ok) {
    console.log(`\n\x1b[32m✓ ${result.message}\x1b[0m`);
  } else {
    console.error(`\n\x1b[31m✗ ${result.message}\x1b[0m`);
    if (result.stderr) {
      console.error("\nError output:");
      console.error(result.stderr);
    }
    process.exit(1);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { command, args, verbose } = parseArgs(process.argv.slice(2));

  if (command === "help") {
    printHelp();
    return;
  }

  const manager = new SkillManager();

  switch (command) {
    case "list":
      cmdList(manager, verbose);
      break;

    case "status":
      cmdStatus(manager, args[0]);
      break;

    case "install":
      if (!args[0]) {
        console.error("Usage: pnpm skills:cli install <skill-id> [install-id]");
        process.exit(1);
      }
      await cmdInstall(manager, args[0], args[1]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
