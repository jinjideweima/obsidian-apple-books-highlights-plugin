import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	lang: 'zh-CN',
	title: "Apple Books\nKnowledge Cards",
	description: "将 Apple Books 的摘录导入 Obsidian，以知识卡片和阅读仪表盘的形式管理",
	base: '/obsidian-apple-books-highlights-plugin/',
  lastUpdated: true,
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: '/logo.svg',
		nav: [
			{ text: '首页', link: '/' },
			{ text: '快速开始', link: '/guide/get-started' }
		],

		search: {
			provider: 'local',
		},

		sidebar: [
			{
				text: '指南',
				items: [
					{ text: '快速开始', link: '/guide/get-started' },
					{ text: '设置说明', link: '/guide/settings' }
				]
			},
			{
				text: '自定义',
				items: [
					{ text: '模板与变量', link: '/customization/templates-and-variables' },
				]
			}
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/bandantonio/obsidian-apple-books-highlights-plugin' }
		],

		footer: {
			message: "Released under the <a href='https://github.com/bandantonio/obsidian-apple-books-highlights-plugin/blob/master/LICENSE' target='_blank'>MIT License</a>.",
			copyright: "基于 <a href='https://github.com/bandantonio' target='_blank'>bandantonio</a> 原插件 fork",
		},
	}
})
