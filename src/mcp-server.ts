import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as vscode from 'vscode';
import { IstariDocument, getIstariDocumentByUri, istariDocuments, getOrCreateIstariUI } from './global';
import * as IstariHelper from './istari_ui_helper';

export class IstariMCPServer {
  private server: Server;
  private httpServer?: http.Server;
  private port: number;

  constructor(port: number = 47821) {
    this.port = port;
    this.server = new Server(
      {
        name: 'istari-vscode',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'open_document',
          description: 'Open an Istari document and add it to the managed documents',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'The file path to open',
              },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'list_documents',
          description: 'List all open Istari documents with their IDs',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'verify_file_up_to_line',
          description: 'Navigate to a specific line in the Istari proof document. Verifies the file up to but not including the given line (1-indexed)',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              line: {
                type: 'number',
                description: 'The line number to navigate to (1-indexed). File is verified up to but not including this line',
              },
            },
            required: ['document_id', 'line'],
          },
        },
        {
          name: 'show_current_goals',
          description: 'Show current proof goals',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
            },
            required: ['document_id'],
          },
        },
        {
          name: 'show_current_goals_verbosely',
          description: 'Show current proof goals with verbose output',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
            },
            required: ['document_id'],
          },
        },
        {
          name: 'list_constants',
          description: 'List all available constants in a specific module',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              module: {
                type: 'string',
                description: 'Module name to list constants from',
              },
            },
            required: ['document_id', 'module'],
          },
        },
        {
          name: 'get_type',
          description: 'Get the type of a constant',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              constant: {
                type: 'string',
                description: 'The constant name to get the type of',
              },
            },
            required: ['document_id', 'constant'],
          },
        },
        {
          name: 'get_definition',
          description: 'Get the definition of a constant',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              constant: {
                type: 'string',
                description: 'The constant name to get the definition of',
              },
            },
            required: ['document_id', 'constant'],
          },
        },
        {
          name: 'search_constants',
          description: 'Search for constants that mention a target type or constant',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              target: {
                type: 'string',
                description: 'The target to search for in constant types',
              },
            },
            required: ['document_id', 'target'],
          },
        },
        {
          name: 'restart_mcp_server',
          description: 'Restart the MCP server (kills current server and starts a new one)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'attempt_tactic_and_insert_if_successful',
          description: 'Try a tactic at the current line, insert it, verify it works by calling nextline, and either keep it (if line advances) or rollback (if it fails)',
          inputSchema: {
            type: 'object',
            properties: {
              document_id: {
                type: 'number',
                description: 'The document ID to operate on',
              },
              tactic: {
                type: 'string',
                description: 'The tactic to attempt',
              },
            },
            required: ['document_id', 'tactic'],
          },
        },
        {
          name: 'get_usage_guide',
          description: 'Get the Istari proof assistant usage guide with syntax, tactics, and best practices',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'list_detailed_documentation_paths',
          description: 'List all available detailed documentation file paths (markdown files only). This provides access to in-depth documentation that is typically not needed for basic usage.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_detailed_documentation',
          description: 'Get the content of a specific detailed documentation file by path. This provides access to in-depth documentation that is typically not needed for basic usage.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The relative path to the documentation file (e.g., "basis/list.md" or "tactics.md")',
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'open_document':
            return await this.openDocument((args as any).file_path);

          case 'list_documents':
            return await this.listDocuments();

          case 'verify_file_up_to_line':
            return await this.gotoLine((args as any).document_id, (args as any).line);

          case 'show_current_goals':
            return await this.showCurrentGoals((args as any).document_id);

          case 'show_current_goals_verbosely':
            return await this.showCurrentGoalsVerbosely((args as any).document_id);

          case 'list_constants':
            return await this.listConstants((args as any).document_id, (args as any).module);

          case 'get_type':
            return await this.getType((args as any).document_id, (args as any).constant);

          case 'get_definition':
            return await this.getDefinition((args as any).document_id, (args as any).constant);

          case 'search_constants':
            return await this.searchConstants((args as any).document_id, (args as any).target);


          case 'restart_mcp_server':
            return await this.restartMcpServer();

          case 'attempt_tactic_and_insert_if_successful':
            return await this.attemptTactic((args as any).document_id, (args as any).tactic);

          case 'get_usage_guide':
            return await this.getUsageGuide();

          case 'list_detailed_documentation_paths':
            return await this.listDocumentationPaths();

          case 'get_detailed_documentation':
            return await this.getDocumentation((args as any).path);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${(error as Error).message}`
        );
      }
    });
  }

  private getDocumentById(id: number): IstariDocument {
    for (const doc of istariDocuments.values()) {
      if (doc.id === id) {
        return doc;
      }
    }
    throw new McpError(ErrorCode.InvalidRequest, `Document with ID ${id} not found`);
  }

  public updateDocument() {
    // No longer needed - documents are managed globally
  }

  private async openDocument(filePath: string): Promise<any> {
    try {
      // Convert file path to URI
      const uri = vscode.Uri.file(filePath);

      // Open the document in VSCode
      const document = await vscode.workspace.openTextDocument(uri);

      if (document.languageId !== 'istari') {
        throw new McpError(ErrorCode.InvalidRequest, `File ${filePath} is not an Istari document`);
      }

      // Create or get the UI for this document
      getOrCreateIstariUI(uri.toString());
      const istariDoc = getIstariDocumentByUri(uri.toString());

      if (!istariDoc) {
        throw new McpError(ErrorCode.InternalError, 'Failed to create Istari document');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Document opened successfully. ID: ${istariDoc.id}, File: ${filePath}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to open document: ${(error as Error).message}`
      );
    }
  }

  private async gotoLine(documentId: number, line: number): Promise<any> {
    const doc = this.getDocumentById(documentId);
    
    // Early check: line must not exceed document length
    const document = doc.ui.getDocument();
    const currentLine = doc.ui.currentLine;
    if (line > document.lineCount) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Line ${line} exceeds document length (${document.lineCount} lines). Current line: ${currentLine}`,
          },
        ],
      };
    }
    
    // Validate that the previous line (if not line 1 and not rewinding) is a valid tactic
    const isRewinding = line < currentLine;
    const isLineOne = line === 1;
    
    if (!isLineOne && !isRewinding && line > 1) {
      // Check the previous line (line - 1) for valid tactic format
      const document = doc.ui.getDocument();
      const previousLineIndex = line - 2; // Convert to 0-based index
      
      if (previousLineIndex >= 0 && previousLineIndex < document.lineCount) {
        const previousLine = document.lineAt(previousLineIndex);
        const previousLineText = previousLine.text.trim();
        
        // Check if previous line is a valid tactic or definition
        // Valid tactics end with . or are {/}
        // Definitions end with ; (define, definerec, typedef, etc.)
        const isValidTactic = previousLineText.endsWith('.') ||
                             previousLineText === '{' ||
                             previousLineText === '}';
        
        const isValidDefinition = previousLineText.endsWith(';');
        
        const isValidLine = isValidTactic || isValidDefinition;
        
        if (previousLineText === '' || !isValidLine) {
          const lineContent = previousLineText === '' ? 'empty' : `"${previousLineText}"`;
          return {
            content: [
              {
                type: 'text',
                text: `verify_file_up_to_line requires previous line to end in . ; { or } but previous line is ${lineContent}. Current line: ${currentLine}`,
              },
            ],
          };
        }
      }
    }
    
    const output = await IstariHelper.gotoLine(doc.ui, line);
    const finalCurrentLine = doc.ui.currentLine;

    return {
      content: [
        {
          type: 'text',
          text: `${output}\nCurrent line: ${finalCurrentLine}`,
        },
      ],
    };
  }

  private async showCurrentGoals(documentId: number): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const result = await IstariHelper.showCurrentGoals(doc.ui);
    const text = result.trim() === '' ? '(no goals)' : result;
    return {
      content: [
        {
          type: 'text',
          text: text,
        },
      ],
    };
  }

  private async showCurrentGoalsVerbosely(documentId: number): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const result = await IstariHelper.showCurrentGoalsVerbosely(doc.ui);
    const text = result.trim() === '' ? '(no goals)' : result;
    return {
      content: [
        {
          type: 'text',
          text: text,
        },
      ],
    };
  }

  private async listConstants(documentId: number, module: string): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const result = await IstariHelper.listConstantsModule(doc.ui, module);
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  private async getType(documentId: number, constant: string): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const output = await IstariHelper.getType(doc.ui, constant);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async getDefinition(documentId: number, constant: string): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const output = await IstariHelper.getDefinition(doc.ui, constant);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async searchConstants(documentId: number, target: string): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const output = await IstariHelper.searchConstants(doc.ui, target);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }


  private async listDocuments(): Promise<any> {
    const documents = Array.from(istariDocuments.entries()).map(([uri, doc]) => {
      // Get document fresh from workspace
      const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
      return {
        id: doc.id,
        uri: uri,
        filename: document?.fileName || 'Unknown',
        basename: document?.fileName.split(/[/\\]/).pop() || document?.fileName || 'Unknown',
        status: doc.ui.status,
        currentLine: doc.ui.currentLine,
        totalLines: document?.lineCount || 0
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            documents: documents,
            totalDocuments: documents.length,
          }, null, 2),
        },
      ],
    };
  }

  async start() {
    await this.startHttpServer();
  }

  private async startHttpServer() {
    this.httpServer = http.createServer(async (req, res) => {
      // Enable CORS for browser clients
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/mcp') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const mcpRequest = JSON.parse(body);
            const response = await this.handleMcpRequest(mcpRequest);

            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(response));
          } catch (error) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.port, 'localhost', () => {
        console.log(`Istari MCP HTTP server started on http://localhost:${this.port}`);
        resolve();
      });

      this.httpServer!.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async handleMcpRequest(request: any): Promise<any> {
    // Handle MCP JSON-RPC 2.0 protocol requests
    try {
      let result;
      switch (request.method) {
        case 'tools/list':
          result = await this.handleListTools();
          break;

        case 'tools/call':
          result = await this.handleCallTool(request.params);
          break;

        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'istari-vscode',
              version: '1.0.0'
            }
          };
          break;

        case 'notifications/initialized':
          result = {};
          break;

        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      // Return JSON-RPC 2.0 response format
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: result
      };
    } catch (error) {
      // Return JSON-RPC 2.0 error response
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    }
  }

  private async handleListTools(): Promise<any> {
    // Use the existing server's handler
    const handler = this.server as any;
    const toolsResponse = await handler._requestHandlers.get('tools/list')({
      method: 'tools/list',
      params: {}
    });
    return toolsResponse;
  }

  private async handleCallTool(params: any): Promise<any> {
    // Use the existing server's handler
    const handler = this.server as any;
    const callResponse = await handler._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: params
    });
    return callResponse;
  }

  private async restartMcpServer(): Promise<any> {
    // Import the global restart function to avoid circular dependencies
    const { restartMcpServer } = require('./global');

    // Schedule restart after sending response
    setTimeout(() => {
      restartMcpServer();
    }, 100);

    return {
      content: [
        {
          type: 'text',
          text: 'MCP server restart initiated. The server will be stopped and restarted momentarily.',
        },
      ],
    };
  }

  private async attemptTactic(documentId: number, tactic: string): Promise<any> {
    const doc = this.getDocumentById(documentId);
    const result = await IstariHelper.attemptTactic(doc.ui, tactic);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            fileChanged: result.fileChanged,
            proofState: result.proofState,
            error: result.error
          }, null, 2),
        },
      ],
    };
  }

  private async getUsageGuide(): Promise<any> {
    try {
      // Get the extension's root directory
      const extensionRoot = path.dirname(__dirname);
      const usageGuidePath = path.join(extensionRoot, 'IstariUsageGuide.md');
      
      // Read the usage guide file
      const usageGuideContent = fs.readFileSync(usageGuidePath, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: usageGuideContent,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read usage guide: ${(error as Error).message}`
      );
    }
  }

  private async listDocumentationPaths(): Promise<any> {
    try {
      // Get the extension's root directory
      const extensionRoot = path.dirname(__dirname);
      const docsDir = path.join(extensionRoot, 'istari_docs');
      
      const markdownFiles: string[] = [];
      
      // Recursively find all .md files
      const findMarkdownFiles = (dir: string, relativePath: string = ''): void => {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          if (fs.statSync(fullPath).isDirectory()) {
            // Recursively search subdirectories
            findMarkdownFiles(fullPath, relativeItemPath);
          } else if (item.endsWith('.md')) {
            // Add .md files to the list
            markdownFiles.push(relativeItemPath);
          }
        }
      };
      
      findMarkdownFiles(docsDir);
      
      // Sort the files for consistent output
      markdownFiles.sort();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(markdownFiles, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list documentation paths: ${(error as Error).message}`
      );
    }
  }

  private async getDocumentation(filePath: string): Promise<any> {
    try {
      // Get the extension's root directory
      const extensionRoot = path.dirname(__dirname);
      const docsDir = path.join(extensionRoot, 'istari_docs');
      const fullPath = path.join(docsDir, filePath);
      
      // Security check: ensure the path is within the docs directory
      const resolvedPath = path.resolve(fullPath);
      const resolvedDocsDir = path.resolve(docsDir);
      
      if (!resolvedPath.startsWith(resolvedDocsDir)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid file path: path must be within the istari_docs directory'
        );
      }
      
      // Check if file exists and is a .md file
      if (!fs.existsSync(fullPath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Documentation file not found: ${filePath}`
        );
      }
      
      if (!filePath.endsWith('.md')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Only markdown (.md) files are supported'
        );
      }
      
      // Read the documentation file
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read documentation file: ${(error as Error).message}`
      );
    }
  }

  async stop() {
    if (this.httpServer) {
      this.httpServer.close();
    }
    await this.server.close();
  }
}