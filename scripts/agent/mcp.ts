// An MCP server (stdio) that gives any MCP client — Claude, an agent runtime like Autora — every Craft3D tool.
//   CRAFT3D_DOC=/path/model.json node dist-agent/mcp.mjs
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { headlessTools, openModel } from './shared';

const model = openModel();
const tools = headlessTools();
const server = new Server({ name: 'craft3d', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as { type: 'object' },
    annotations: { readOnlyHint: !!t.readOnly, destructiveHint: !t.readOnly },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  const { ifRevision, ...rest } = args;
  const res = await model.call(req.params.name, rest, typeof ifRevision === 'number' ? ifRevision : undefined);
  return { content: [{ type: 'text', text: JSON.stringify(res) }], isError: !res.ok };
});

await server.connect(new StdioServerTransport());
console.error(`craft3d MCP server ready · model file ${model.file} · ${tools.length} tools`);
