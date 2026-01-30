"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreflightService = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
class PreflightService {
    client;
    sessionToken = null;
    constructor(apiUrl) {
        this.client = axios_1.default.create({
            baseURL: apiUrl,
            timeout: 60000, // 60 second timeout for analysis
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Initialize a pre-flight session
     */
    async initSession(repositoryName) {
        try {
            const response = await this.client.post('/api/preflight/sessions', {
                repositoryId: repositoryName,
                context: {
                    ide: 'vscode',
                    version: vscode.version,
                    extensionVersion: '0.1.0',
                },
            });
            this.sessionToken = response.data.sessionToken;
            return response.data.sessionId;
        }
        catch (error) {
            console.error('Failed to initialize session:', error);
            throw new Error('Failed to connect to PRFlow server');
        }
    }
    /**
     * Analyze files for potential issues
     */
    async analyze(repositoryName, files, cancellationToken) {
        // Create axios cancel token from VS Code cancellation token
        const source = axios_1.default.CancelToken.source();
        if (cancellationToken) {
            cancellationToken.onCancellationRequested(() => {
                source.cancel('Operation cancelled by user');
            });
        }
        try {
            // Initialize session if needed
            if (!this.sessionToken) {
                await this.initSession(repositoryName);
            }
            // Submit files for analysis
            const response = await this.client.post('/api/preflight/analyze', {
                files: files.map(f => ({
                    path: f.path,
                    content: f.content,
                })),
                options: {
                    checkTypes: ['security', 'bugs', 'performance', 'style'],
                    generateFixes: true,
                },
            }, {
                cancelToken: source.token,
                headers: {
                    'X-Session-Token': this.sessionToken,
                },
            });
            return this.parseResponse(response.data);
        }
        catch (error) {
            if (axios_1.default.isCancel(error)) {
                throw new Error('Analysis cancelled');
            }
            if (axios_1.default.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    throw new Error('Cannot connect to PRFlow server. Make sure it is running.');
                }
                if (error.response?.status === 401) {
                    this.sessionToken = null;
                    throw new Error('Session expired. Please try again.');
                }
                if (error.response?.data?.error) {
                    throw new Error(error.response.data.error);
                }
            }
            throw new Error('Analysis failed. Check PRFlow server logs.');
        }
    }
    /**
     * Get status of an ongoing analysis
     */
    async getStatus(sessionId) {
        const response = await this.client.get(`/api/preflight/sessions/${sessionId}/status`, {
            headers: {
                'X-Session-Token': this.sessionToken,
            },
        });
        return response.data;
    }
    /**
     * Apply a suggested fix
     */
    async applyFix(sessionId, issueId) {
        const response = await this.client.post(`/api/preflight/sessions/${sessionId}/fixes/${issueId}/apply`, {}, {
            headers: {
                'X-Session-Token': this.sessionToken,
            },
        });
        return response.data;
    }
    parseResponse(data) {
        const apiResponse = data;
        const issues = (apiResponse.issues || []).map(issue => ({
            type: issue.type || 'unknown',
            severity: this.mapSeverity(issue.severity),
            message: issue.message || 'Unknown issue',
            file: issue.file || 'unknown',
            line: issue.line || 1,
            column: issue.column,
            endLine: issue.endLine,
            endColumn: issue.endColumn,
            suggestion: issue.suggestion,
            fix: issue.fix,
            category: issue.category || 'general',
        }));
        return {
            sessionId: apiResponse.sessionId || '',
            status: this.mapStatus(apiResponse.status),
            issues,
            summary: {
                totalFiles: apiResponse.summary?.totalFiles || 0,
                totalIssues: issues.length,
                criticalCount: issues.filter(i => i.severity === 'critical').length,
                errorCount: issues.filter(i => i.severity === 'error').length,
                warningCount: issues.filter(i => i.severity === 'warning').length,
                infoCount: issues.filter(i => i.severity === 'info').length,
            },
            recommendations: apiResponse.recommendations || [],
            analysisTimeMs: apiResponse.analysisTimeMs || 0,
        };
    }
    mapSeverity(severity) {
        switch (severity?.toLowerCase()) {
            case 'critical':
                return 'critical';
            case 'error':
            case 'high':
                return 'error';
            case 'warning':
            case 'medium':
                return 'warning';
            default:
                return 'info';
        }
    }
    mapStatus(status) {
        switch (status?.toLowerCase()) {
            case 'error':
            case 'failed':
                return 'error';
            case 'warning':
                return 'warning';
            default:
                return 'success';
        }
    }
}
exports.PreflightService = PreflightService;
//# sourceMappingURL=preflight-service.js.map