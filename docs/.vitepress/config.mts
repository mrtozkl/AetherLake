import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: "AetherLake",
  description: "Open-source Data Lakehouse platform on Kubernetes.",
  base: '/AetherLake/', // For GitHub Pages deployment
  head: [
    ['link', { rel: 'icon', href: '/AetherLake/favicon.ico' }]
  ],
  themeConfig: {
    logo: '/logo.png', // We will copy the logo to public dir
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/quick-start' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is AetherLake?', link: '/guide/introduction' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Components', link: '/guide/components' },
        ]
      },
      {
        text: 'Component Reference',
        items: [
          { text: 'Keycloak — SSO', link: '/guide/components/keycloak' },
          { text: 'MinIO — Storage', link: '/guide/components/minio' },
          { text: 'Trino — Query', link: '/guide/components/trino' },
          { text: 'Apache Polaris — Catalog', link: '/guide/components/polaris' },
          { text: 'Apache Airflow — Orchestration', link: '/guide/components/airflow' },
          { text: 'Apache Superset — BI', link: '/guide/components/superset' },
          { text: 'Milvus — Vector DB', link: '/guide/components/milvus' },
          { text: 'Apache Spark — Processing', link: '/guide/components/spark' },
          { text: 'PostgreSQL — Datastores', link: '/guide/components/postgres' },
        ]
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Configuration Guide', link: '/guide/configuration' },
          { text: 'Control Panel', link: '/guide/control-panel' },
          { text: 'MCP Server', link: '/guide/mcp-server' },
          { text: 'Data Pipelines', link: '/guide/pipelines' }
        ]
      },
      {
        text: 'About',
        items: [
          { text: 'License', link: '/guide/license' },
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mrtozkl/AetherLake' }
    ],
    footer: {
      message: 'Released under the Business Source License 1.1.',
      copyright: 'Built with ❤️ for the open-source data community'
    }
  }
}))
