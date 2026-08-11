import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// @ts-ignore — provided by jiti runtime
const BASE = typeof __dirname !== "undefined" ? __dirname : new URL(".", import.meta.url).pathname;
const GENERATOR = join(BASE, "generate.py");

function listConfigs(): string[] {
  const configsDir = join(BASE, "configs");
  if (!existsSync(configsDir)) return [];
  return readdirSync(configsDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(".yaml", ""));
}

function listThemes(): string[] {
  const themesDir = join(BASE, "themes");
  if (!existsSync(themesDir)) return [];
  return readdirSync(themesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "generate_cv",
    label: "Generate CV",
    description:
      "Generate a CV PDF from a job config and theme. Creates a new config if it doesn't exist. Use when the user wants to create or update their CV for a specific job application.",
    parameters: Type.Object({
      job: Type.String({
        description:
          "Job config name (e.g. 'sidestream', 'brandung'). Will be created if it doesn't exist.",
      }),
      theme: Type.Optional(
        Type.String({
          description: "Theme name (default: 'personal')",
          default: "personal",
        }),
      ),
      email: Type.Optional(
        Type.String({
          description:
            "Email address to use in the CV header. Overrides config.",
        }),
      ),
      phone: Type.Optional(
        Type.String({
          description:
            "Phone number to use in the CV header. Overrides config.",
        }),
      ),
      location: Type.Optional(
        Type.String({
          description: "Location to show. Overrides config.",
        }),
      ),
      languages: Type.Optional(
        Type.String({
          description:
            'Language line (e.g. "DE (Muttersprache) · EN (C1)"). Empty string to hide. Overrides config.',
        }),
      ),
      border: Type.Optional(
        Type.Boolean({
          description:
            "Whether to show the header border. Default: true. Overrides config.",
        }),
      ),
    }),
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      const { job, theme } = params;

      // Check if config exists
      const configPath = join(BASE, "configs", `${job}.yaml`);
      if (!existsSync(configPath)) {
        return {
          content: [
            {
              type: "text",
              text: `Config '${job}' does not exist. Available configs: ${listConfigs().join(", ") || "(none)"}

To create a new config, write a YAML file at configs/${job}.yaml with fields:
  email: string
  phone: string  
  location: string
  languages: string (or "" to hide)
  border: boolean
  output: string (PDF filename)

Or use write_file tool to create it, then call generate_cv again.`,
            },
          ],
          details: {},
        };
      }

      // Build command
      const args = ["generate.py", "--job", job];
      if (theme) args.push("--theme", theme);

      try {
        const stdout = execSync(`python3 ${args.join(" ")}`, {
          cwd: BASE,
          encoding: "utf-8",
          timeout: 30_000,
          signal,
        });
        const outputPath = stdout.trim().replace("✅ ", "");

        return {
          content: [
            {
              type: "text",
              text: `CV generated: \`${outputPath}\`\n\nJob: ${job}\nTheme: ${theme || "personal"}`,
            },
          ],
          details: { outputPath, job, theme: theme || "personal" },
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating CV: ${err.message || err}`,
            },
          ],
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "list_cv_configs",
    label: "List CV Configs",
    description:
      "List all available CV job configs and themes. Use to see what's available before generating.",
    parameters: Type.Object({}),
    async execute() {
      const configs = listConfigs();
      const themes = listThemes();

      let text = "**CV Configs:**\n";
      text += configs.length
        ? configs.map((c) => `- ${c}`).join("\n")
        : "  (none)";
      text += "\n\n**Themes:**\n";
      text += themes.length
        ? themes.map((t) => `- ${t}`).join("\n")
        : "  (none)";

      return {
        content: [{ type: "text", text }],
        details: { configs, themes },
      };
    },
  });

  pi.on("session_start", async (_event, _ctx) => {
    const configs = listConfigs();
    const themes = listThemes();
    if (configs.length > 0 || themes.length > 0) {
      // Extension loaded silently — tools available
    }
  });

  pi.on("resources_discover", async (_event, _ctx) => {
    const skillPath = join(BASE, "SKILL.md");
    if (existsSync(skillPath)) {
      return { skillPaths: [skillPath] };
    }
  });
}
