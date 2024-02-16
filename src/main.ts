// Import necessary modules from Obsidian and node-shikimori
import {App, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
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
			const animeRates = await this.shikimoriClient.users.animeRates(
				{censored: false, id: "SolAstri", limit: 100, page: 0, status: "completed"}
			);
			// Process animeRates here...
		} catch (error) {
			console.error("Failed to sync Shikimori lists:", error);
		}
	}
	async loadPluginSettings() {
		let settingsFile = this.app.vault.getAbstractFileByPath('.obsidian/plugins/obsidian-shikimori/settings.json');
		// it returns null or a TAbstractFile
		if (settingsFile) {
			// this.app.vault.read() takes a TFile, not a TAbstractFile, so we need to cast it
			this.settings = JSON.parse(await this.app.vault.read(settingsFile as TFile)) as ObsidianShikimoriSettings;
		} else {
			this.settings = DEFAULT_SETTINGS;
		}
	}
	async savePluginSettings() {
		let file = this.app.vault.getAbstractFileByPath(
			'.obsidian/plugins/obsidian-shikimori/settings.json'
		);
		if (file) {
			await this.app.vault.modify(file as TFile, JSON.stringify(this.settings, null, 2));
		} else {
			// Create the settings file if it doesn't exist
			await this.app.vault.create(
				'.obsidian/plugins/obsidian-shikimori/settings.json',
				JSON.stringify(this.settings, null, 2)
			);
		}
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
