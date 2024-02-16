// Import necessary modules from Obsidian and node-shikimori
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { client as ShikimoriClient, auth as ShikimoriAuth } from 'node-shikimori';

interface ObsidianShikimoriSettings {
	clientId: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
}

const DEFAULT_SETTINGS: ObsidianShikimoriSettings = {
	clientId: '',
	clientSecret: '',
	accessToken: '',
	refreshToken: '',
}

export default class ObsidianShikimoriPlugin extends Plugin {
	settings: ObsidianShikimoriSettings;
	shikimoriClient = ShikimoriClient({clientName: "Obsidian", maxCallsPerMinute: 120, maxCallsPerSecond: 10});

	async onload() {
		await this.loadPluginSettings();

		// Initialize Shikimori client with access token if available
		if (this.settings.accessToken) {
			this.shikimoriClient.setAccessToken(this.settings.accessToken);
		}

		this.addSettingTab(new ObsidianShikimoriSettingTab(this.app, this));

		// Add command to sync Shikimori lists
		this.addCommand({
			id: 'sync-shikimori-lists',
			name: 'Sync Shikimori Lists',
			callback: () => this.syncShikimoriLists(),
		});
	}

	async syncShikimoriLists() {
		if (!this.settings.accessToken) {
			console.error("Access token not set. Please authenticate first.");
			return;
		}

		try {
			// Example of fetching and processing anime rates
			const animeRates = await this.shikimoriClient.users.animeRates({ user_id: 'me' });
			// Process animeRates here...
		} catch (error) {
			console.error("Failed to sync Shikimori lists:", error);
		}
	}
	async loadPluginSettings() {
		const data = await this.app.vault.read('.obsidian/plugins/obsidian-shikimori/settings.json').catch(() => '{}');
		this.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(data));
	}

	async savePluginSettings() {
		await this.app.vault.write('.obsidian/plugins/obsidian-shikimori/settings.json', JSON.stringify(this.settings));
	}

	configureClient() {
		if (this.settings.accessToken) {
			this.shikimoriClient.setAccessToken(this.settings.accessToken);
		}
	}
}

class ObsidianShikimoriSettingTab extends PluginSettingTab {
	plugin: ObsidianShikimoriPlugin;

	constructor(app: App, plugin: ObsidianShikimoriPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('Your Shikimori client ID')
			.addText(text => text
				.setValue(this.plugin.settings.clientId || '')
				.onChange(async (value) => {
					this.plugin.settings.clientId = value;
					await this.plugin.savePluginSettings();
				}));

		new Setting(containerEl)
			.setName('Client Secret')
			.setDesc('Your Shikimori client secret')
			.addText(text => text
				.setValue(this.plugin.settings.clientSecret || '')
				.onChange(async (value) => {
					this.plugin.settings.clientSecret = value;
					await this.plugin.savePluginSettings();
				}));

		new Setting(containerEl)
			.setName('Access Token')
			.setDesc('Your Shikimori access token')
			.addText(text => text
				.setValue(this.plugin.settings.accessToken || '')
				.onChange(async (value) => {
					this.plugin.settings.accessToken = value;
					await this.plugin.savePluginSettings();
				}));
	}
}
