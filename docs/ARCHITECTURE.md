# PRFlow Architecture

This document provides a comprehensive overview of PRFlow's system architecture, including component design, data flow, and technical decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Multi-Agent Architecture](#multi-agent-architecture)
- [Data Flow](#data-flow)
- [Component Design](#component-design)
- [Database Schema](#database-schema)
- [Security Architecture](#security-architecture)
- [Scalability Considerations](#scalability-considerations)
- [Technology Stack](#technology-stack)

---

## System Overview

PRFlow is built as a modular, event-driven platform that processes pull requests through a pipeline of specialized AI agents. The architecture emphasizes:

- **Parallelism**: Agents run concurrently where possible
- **Resilience**: Failed jobs can be retried without losing progress
- **Scalability**: Horizontal scaling via job queues
- **Extensibility**: New agents can be added without modifying core logic

### High-Level Architecture

```mermaid
flowchart TB
    subgraph External["External Systems"]
        GH[GitHub]
        IDE[VS Code Extension]
        CI[GitHub Actions]
    end

    subgraph PRFlow["PRFlow Platform"]
        subgraph Edge["Edge Layer"]
            LB[Load Balancer]
            API[Fastify API]
            WS[WebSocket Server]
        end

        subgraph Processing["Processing Layer"]
            Queue[(Redis Queue)]
            Workers[BullMQ Workers]
        end

        subgraph Intelligence["Intelligence Layer"]
            Agents[Multi-Agent System]
            ML[ML Pipeline]
        end

        subgraph Persistence["Data Layer"]
            Cache[(Redis Cache)]
            DB[(PostgreSQL)]
        end

        subgraph Dashboard["Web Layer"]
            Next[Next.js App]
        end
    end

    GH <-->|Webhooks/API| API
    IDE -->|Pre-flight| API
    CI -->|Analysis| API

    API --> Queue
    API <--> Cache
    API <--> DB

    Queue --> Workers
    Workers --> Agents
    Agents --> ML
    Agents --> DB

    Next <-->|REST/WS| API
    WS <--> Next

    LB --> API
    LB --> WS
```

---

## Multi-Agent Architecture

PRFlow uses a multi-agent system where specialized agents handle different aspects of code review. This design allows for:

- **Separation of concerns**: Each agent focuses on one task
- **Parallel execution**: Independent agents run concurrently
- **Easy extension**: New capabilities via new agents
- **Customization**: Agents can be enabled/disabled per repository

### Agent Hierarchy

```mermaid
flowchart TB
    subgraph Core["Core Agents"]
        Analyzer[🔍 Analyzer Agent]
        Reviewer[🐛 Reviewer Agent]
        TestGen[🧪 Test Generator]
        DocGen[📝 Documentation Agent]
        Synthesis[📋 Synthesis Agent]
    end

    subgraph Advanced["Advanced Agents"]
        Compliance[🔐 Compliance Agent]
        Intent[🎯 Intent Agent]
        Migration[🔄 Migration Agent]
        Decomposition[✂️ Decomposition Agent]
        KnowledgeGraph[🧠 Knowledge Graph Agent]
    end

    subgraph Specialized["Specialized Agents"]
        PairReviewer[👥 Pair Reviewer]
        DebtDashboard[📊 Debt Dashboard]
        Personas[🎭 Review Personas]
        PredictiveCI[⚡ Predictive CI]
        NLQuery[💬 NL Query Agent]
    end

    subgraph Orchestration["Orchestration"]
        MultiRepo[🔗 Multi-Repo Agent]
        Collaborative[🤝 Collaborative Review]
        LearningPaths[🎓 Learning Paths]
    end
```

### Agent Execution Flow

```mermaid
sequenceDiagram
    autonumber
    participant WH as Webhook
    participant Q as Job Queue
    participant AN as Analyzer
    participant RV as Reviewer
    participant TG as Test Gen
    participant DC as Doc Gen
    participant SY as Synthesis
    participant GH as GitHub

    WH->>Q: PR Event
    Q->>AN: Start Analysis

    AN->>AN: Parse Diff
    AN->>AN: Build AST
    AN->>AN: Detect Changes
    AN->>AN: Assess Risk

    par Parallel Processing
        AN->>RV: Code Review
        AN->>TG: Generate Tests
        AN->>DC: Update Docs
    end

    RV-->>SY: Review Results
    TG-->>SY: Generated Tests
    DC-->>SY: Doc Updates

    SY->>SY: Consolidate
    SY->>SY: Generate Summary

    SY->>GH: Post Comments
    SY->>GH: Create Check Run
```

### Agent Interface

All agents implement a common interface:

```typescript
interface Agent<TInput, TOutput> {
  name: string;
  version: string;

  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;

  validate?(input: TInput): ValidationResult;
  cleanup?(): Promise<void>;
}

interface AgentContext {
  repositoryId: string;
  workflowId: string;
  installationId: number;
  config: RepositorySettings;
  logger: Logger;
}

interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metrics?: {
    latencyMs: number;
    tokensUsed?: number;
  };
}
```

---

## Data Flow

### PR Processing Pipeline

```mermaid
flowchart LR
    subgraph Input
        PR[Pull Request]
        Diff[Git Diff]
        Files[Changed Files]
    end

    subgraph Analysis
        Parse[Parse Diff]
        AST[Build AST]
        Semantic[Semantic Analysis]
        Risk[Risk Assessment]
    end

    subgraph Review
        Security[Security Check]
        Bugs[Bug Detection]
        Perf[Performance]
        Style[Style Check]
    end

    subgraph Generation
        Tests[Generate Tests]
        Docs[Generate Docs]
        Fixes[Generate Fixes]
    end

    subgraph Output
        Comments[Review Comments]
        CheckRun[Check Run]
        Summary[PR Summary]
    end

    PR --> Parse
    Diff --> Parse
    Files --> Parse

    Parse --> AST
    AST --> Semantic
    Semantic --> Risk

    Risk --> Security
    Risk --> Bugs
    Risk --> Perf
    Risk --> Style

    Security --> Comments
    Bugs --> Comments
    Perf --> Comments
    Style --> Fixes

    Semantic --> Tests
    Semantic --> Docs

    Tests --> Summary
    Docs --> Summary
    Comments --> Summary

    Summary --> CheckRun
```

### Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: PR Created/Updated

    PENDING --> ANALYZING: Job Picked Up

    ANALYZING --> REVIEWING: Analysis Complete
    ANALYZING --> FAILED: Error

    REVIEWING --> GENERATING_TESTS: Review Complete
    REVIEWING --> FAILED: Error

    GENERATING_TESTS --> UPDATING_DOCS: Tests Generated
    GENERATING_TESTS --> FAILED: Error

    UPDATING_DOCS --> SYNTHESIZING: Docs Updated
    UPDATING_DOCS --> FAILED: Error

    SYNTHESIZING --> COMPLETED: Synthesis Done
    SYNTHESIZING --> FAILED: Error

    FAILED --> PENDING: Retry

    COMPLETED --> [*]

    note right of ANALYZING
        Parses diff
        Builds AST
        Detects changes
        Assesses risk
    end note

    note right of REVIEWING
        Security scan
        Bug detection
        Performance check
        Style analysis
    end note

    note right of GENERATING_TESTS
        Identifies coverage gaps
        Generates unit tests
        Validates tests
    end note
```

### Job Queue Architecture

```mermaid
flowchart TB
    subgraph Producers
        API[API Server]
        WH[Webhook Handler]
        Scheduler[Scheduler]
    end

    subgraph Queue["Redis Queue (BullMQ)"]
        High[High Priority]
        Normal[Normal Priority]
        Low[Low Priority]
        Delayed[Delayed Jobs]
    end

    subgraph Workers["Worker Pool"]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
        WN[Worker N]
    end

    subgraph Processing
        Agents[Agent Execution]
        DB[(Database)]
        GH[GitHub API]
    end

    API --> Normal
    WH --> High
    Scheduler --> Delayed

    Delayed -->|Due| Normal

    High --> W1
    Normal --> W2
    Normal --> W3
    Low --> WN

    W1 --> Agents
    W2 --> Agents
    W3 --> Agents
    WN --> Agents

    Agents --> DB
    Agents --> GH
```

---

## Component Design

### API Layer

```mermaid
flowchart TB
    subgraph API["Fastify API Server"]
        Router[Router]

        subgraph Middleware
            Auth[Authentication]
            RateLimit[Rate Limiting]
            Validation[Request Validation]
            ErrorHandler[Error Handler]
        end

        subgraph Routes
            Health[/health]
            Repos[/repositories]
            Workflows[/workflows]
            Analytics[/analytics]
            Enterprise[/enterprise]
        end

        subgraph Plugins
            Prisma[Prisma Plugin]
            Redis[Redis Plugin]
            WebSocket[WebSocket Plugin]
        end
    end

    Router --> Auth
    Auth --> RateLimit
    RateLimit --> Validation
    Validation --> Routes
    Routes --> Plugins
    ErrorHandler -.->|Catches| Routes
```

### Service Layer

```mermaid
flowchart LR
    subgraph Services
        subgraph Core
            AnalyticsS[Analytics Service]
            AssignmentS[Assignment Service]
            LearningS[Learning Service]
        end

        subgraph Security
            SecurityS[Security Scanner]
            ComplianceS[Compliance Service]
        end

        subgraph Integration
            GitHubS[GitHub Service]
            WebhookS[Webhook Service]
        end

        subgraph Advanced
            KnowledgeS[Knowledge Graph]
            MergeQueueS[Merge Queue]
            MLPipelineS[ML Pipeline]
        end
    end

    subgraph External
        DB[(Database)]
        Redis[(Redis)]
        GitHub[GitHub API]
        LLM[LLM Provider]
    end

    Core --> DB
    Core --> Redis
    Security --> LLM
    Integration --> GitHub
    Advanced --> DB
    Advanced --> LLM
```

### Frontend Architecture

```mermaid
flowchart TB
    subgraph Next["Next.js Application"]
        subgraph Pages["App Router"]
            Dashboard[Dashboard]
            Repos[Repositories]
            Workflows[Workflows]
            Analytics[Analytics]
            Settings[Settings]
        end

        subgraph Components
            Layout[Layout Components]
            UI[UI Components]
            Charts[Chart Components]
            Forms[Form Components]
        end

        subgraph State
            ReactQuery[React Query]
            Context[React Context]
        end

        subgraph Lib
            API[API Client]
            Utils[Utilities]
        end
    end

    subgraph Backend
        REST[REST API]
        WS[WebSocket]
    end

    Pages --> Components
    Components --> State
    State --> Lib
    Lib --> REST
    Lib --> WS
```

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ Team : has
    Organization ||--o{ Repository : owns

    Team ||--o{ TeamMember : has
    Team ||--o| Subscription : has

    User ||--o{ TeamMember : belongs_to
    User ||--o{ Session : has

    Repository ||--o{ PRWorkflow : processes
    Repository ||--o| RepositorySettings : has
    Repository ||--o{ TestPattern : defines

    PRWorkflow ||--o| PRAnalysis : produces
    PRWorkflow ||--o{ ReviewComment : generates
    PRWorkflow ||--o{ GeneratedTest : creates
    PRWorkflow ||--o{ DocUpdate : suggests
    PRWorkflow ||--o| PRSynthesis : summarizes

    ReviewComment ||--o{ FixApplication : has

    Organization {
        string id PK
        int githubId UK
        string login UK
        string name
        int installationId UK
    }

    Team {
        string id PK
        string name
        string organizationId FK
        json settings
    }

    User {
        string id PK
        int githubId UK
        string login UK
        string name
        string email
    }

    Repository {
        string id PK
        int githubId UK
        string fullName UK
        string owner
        string defaultBranch
        boolean isPrivate
    }

    PRWorkflow {
        string id PK
        string repositoryId FK
        int prNumber
        string status
        datetime startedAt
        datetime completedAt
    }

    PRAnalysis {
        string id PK
        string workflowId FK UK
        enum prType
        enum riskLevel
        int filesModified
        json semanticChanges
    }

    ReviewComment {
        string id PK
        string workflowId FK
        string file
        int line
        enum severity
        enum category
        string message
        json suggestion
    }
```

### Key Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `organizations` | GitHub organizations | githubId, installationId |
| `teams` | Team management | organizationId, settings |
| `users` | User accounts | githubId, login, email |
| `repositories` | Connected repos | githubId, fullName, settings |
| `pr_workflows` | PR processing state | repositoryId, prNumber, status |
| `pr_analyses` | Analysis results | workflowId, prType, riskLevel |
| `review_comments` | Generated comments | workflowId, severity, category |
| `generated_tests` | Auto-generated tests | workflowId, testCode, framework |
| `fix_applications` | Applied fixes | commentId, commitSha, status |

---

## Security Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant API
    participant GitHub
    participant DB

    User->>Dashboard: Click Login
    Dashboard->>API: GET /auth/login
    API->>GitHub: Redirect to OAuth
    GitHub->>User: Authorization Page
    User->>GitHub: Approve
    GitHub->>API: Callback with code
    API->>GitHub: Exchange for token
    GitHub-->>API: Access token
    API->>GitHub: Get user info
    GitHub-->>API: User data
    API->>DB: Upsert user
    API->>API: Generate JWT
    API->>Dashboard: Redirect with tokens
    Dashboard->>User: Authenticated
```

### Security Layers

```mermaid
flowchart TB
    subgraph External
        Client[Client]
        GitHub[GitHub]
    end

    subgraph Edge["Edge Security"]
        TLS[TLS 1.3]
        WAF[WAF Rules]
        RateLimit[Rate Limiting]
    end

    subgraph Auth["Authentication"]
        JWT[JWT Validation]
        OAuth[GitHub OAuth]
        SSO[SAML/OIDC]
    end

    subgraph Authorization
        RBAC[Role-Based Access]
        TeamPerm[Team Permissions]
        RepoPerm[Repository Scopes]
    end

    subgraph Data["Data Security"]
        Encryption[Encryption at Rest]
        Secrets[Secret Management]
        Audit[Audit Logging]
    end

    Client --> TLS
    GitHub --> TLS
    TLS --> WAF
    WAF --> RateLimit
    RateLimit --> JWT
    JWT --> RBAC
    RBAC --> TeamPerm
    TeamPerm --> RepoPerm
    RepoPerm --> Encryption
    Encryption --> Secrets
    Secrets --> Audit
```

---

## Scalability Considerations

### Horizontal Scaling

```mermaid
flowchart TB
    subgraph LoadBalancing
        LB[Load Balancer]
    end

    subgraph API["API Tier (Stateless)"]
        API1[API Server 1]
        API2[API Server 2]
        APIN[API Server N]
    end

    subgraph Workers["Worker Tier (Stateless)"]
        W1[Worker 1]
        W2[Worker 2]
        WN[Worker N]
    end

    subgraph SharedState["Shared State"]
        Redis[(Redis Cluster)]
        PG[(PostgreSQL)]
    end

    LB --> API1
    LB --> API2
    LB --> APIN

    API1 --> Redis
    API2 --> Redis
    APIN --> Redis

    API1 --> PG
    API2 --> PG
    APIN --> PG

    Redis --> W1
    Redis --> W2
    Redis --> WN

    W1 --> PG
    W2 --> PG
    WN --> PG
```

### Caching Strategy

| Layer | Technology | TTL | Purpose |
|-------|------------|-----|---------|
| API Response | Redis | 5 min | Repeated queries |
| Knowledge Graph | Redis | 1 hour | Graph data |
| User Sessions | Redis | 24 hours | Auth state |
| ML Models | Memory | Indefinite | Inference speed |
| GitHub API | Redis | 1 min | Rate limit protection |

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Latency (p99) | < 200ms | ~150ms |
| Workflow Start Time | < 5s | ~3s |
| Analysis Time (small PR) | < 30s | ~20s |
| Analysis Time (large PR) | < 2min | ~90s |
| Concurrent Workflows | 1000+ | 500+ |

---

## Technology Stack

### Core Technologies

```mermaid
mindmap
  root((PRFlow))
    Backend
      Node.js 20+
      TypeScript 5.3
      Fastify 4.x
      Prisma 5.x
      BullMQ 5.x
    Frontend
      Next.js 15
      React 19
      TailwindCSS
      React Query
    Data
      PostgreSQL 16
      Redis 7
      Prisma ORM
    AI/ML
      GitHub Copilot SDK
      Custom Agents
      Knowledge Graphs
    DevOps
      Docker
      Kubernetes
      GitHub Actions
      Turborepo
```

### Package Dependencies

| Category | Package | Version | Purpose |
|----------|---------|---------|---------|
| Framework | Fastify | 4.26.0 | API server |
| ORM | Prisma | 5.10.0 | Database access |
| Queue | BullMQ | 5.1.0 | Job processing |
| Cache | ioredis | 5.3.0 | Redis client |
| Logging | Pino | 8.18.0 | Structured logging |
| Validation | Zod | 3.22.0 | Schema validation |
| GitHub | Octokit | 3.x | GitHub API |
| Frontend | Next.js | 15.1.0 | React framework |
| Styling | Tailwind | 3.4.1 | CSS framework |

### Monorepo Structure

```mermaid
flowchart TB
    subgraph Root["prflow (Turborepo)"]
        subgraph Apps
            API[apps/api]
            Web[apps/web]
            Action[apps/action]
        end

        subgraph Packages
            Core[packages/core]
            DB[packages/db]
            GitHub[packages/github-client]
            Config[packages/config]
        end

        subgraph Extensions
            VSCode[extensions/vscode-prflow]
        end
    end

    API --> Core
    API --> DB
    API --> GitHub
    API --> Config

    Web --> Core
    Web --> Config

    Action --> Core
    Action --> GitHub

    VSCode --> Core
```

---

## Deployment Architecture

### Production Deployment

```mermaid
flowchart TB
    subgraph Internet
        Users[Users]
        GitHub[GitHub]
    end

    subgraph Cloud["Cloud Provider"]
        subgraph Edge
            CDN[CDN]
            LB[Load Balancer]
        end

        subgraph Compute["Compute (Kubernetes)"]
            subgraph API["API Pods"]
                API1[API]
                API2[API]
            end
            subgraph Worker["Worker Pods"]
                W1[Worker]
                W2[Worker]
            end
            subgraph Web["Web Pods"]
                Web1[Next.js]
            end
        end

        subgraph Data["Managed Services"]
            PG[(PostgreSQL)]
            Redis[(Redis)]
        end
    end

    Users --> CDN
    GitHub --> LB
    CDN --> Web1
    LB --> API1
    LB --> API2

    API1 --> PG
    API2 --> PG
    API1 --> Redis
    API2 --> Redis

    Redis --> W1
    Redis --> W2
    W1 --> PG
    W2 --> PG
```

---

## Future Considerations

### Planned Improvements

1. **Event Sourcing**: Move to event-sourced architecture for better auditability
2. **GraphQL API**: Add GraphQL layer for flexible querying
3. **Plugin System**: Allow custom agents via plugin architecture
4. **Multi-Region**: Deploy across regions for lower latency
5. **Streaming**: Real-time streaming of analysis results

### Technical Debt

- [ ] Migrate to ESM-only modules
- [ ] Add OpenTelemetry tracing
- [ ] Implement circuit breakers for external services
- [ ] Add comprehensive E2E test suite
- [ ] Implement proper feature flags system
