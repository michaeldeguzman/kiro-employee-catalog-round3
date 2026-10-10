# OutSystems MCP Tool Policy

When interacting with the `outsystems-platform` MCP server:
- **Allowed inspection tools**: Only use inspection tools (`context_entities`, `context_actions`, `get_app_info`) during the Pre-flight and Verification phases.
- **Allowed mutation tools**: Only use action/logic creation tools to build the 4 CRUD wrapper actions in the `Employee` folder.
- **Strictly Prohibited**: Do NOT invoke any tools that delete apps, drop existing entities, or modify tenant-level configuration. Always prompt for user confirmation before executing any schema-altering operation.