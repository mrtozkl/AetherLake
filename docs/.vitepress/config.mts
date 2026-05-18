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
        text: 'Configuration',
        items: [
          { text: 'Configuration Guide', link: '/guide/configuration' },
          { text: 'Control Panel', link: '/guide/control-panel' },
          { text: 'MCP Server', link: '/guide/mcp-server' },
          { text: 'Data Pipelines', link: '/guide/pipelines' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mrtozkl/AetherLake' }
    ],
    footer: {
      message: 'Released under the Apache 2.0 License.',
      copyright: 'Built with ❤️ for the open-source data community'
    }
  }
}))
