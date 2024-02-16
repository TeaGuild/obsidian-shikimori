// Import necessary modules from Obsidian and node-shikimori
import {App, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import {client as ShikimoriClient, auth as ShikimoriAuth, UserRateExtended, AnimeBasic} from 'node-shikimori';

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

		// Add command to authenticate with Shikimori
		this.addCommand({
			id: 'authenticate-with-shikimori',
			name: 'Authenticate with Shikimori',
			callback: () => this.redirectToAuthPage(),
		});
	}

	async formatAnimeRates(animeRates: Array<UserRateExtended<AnimeBasic>>) : Promise<string> {
		const formattedRates = await Promise.all(animeRates.map(async (rate) => {
			let finalString = `## ${rate.anime.name}\n`;

			// Russian Title (As Italic Subtitle)
			if (rate.anime.russian) {
				finalString += `*${rate.anime.russian}*\n\n`;
			}

			// Core Metadata Table
			finalString += `
| Metadata          | Value           |
|-------------------|-----------------|
| **Score**         | ${rate.score}   |
| **Status**        | ${rate.status}  |
| **Episodes**      | ${rate.episodes} |
| **Rewatches**     | ${rate.rewatches} |
    \n`;

			// User Comment (if available)
			if (rate.text) {
				finalString += `> ${rate.text}\n\n`;
			}

			// Additional Details
			finalString += `
* **Total Episodes:** ${rate.anime.episodes}
* **Aired on:** ${rate.anime.aired_on}
* **Public Score:** ${rate.anime.score}
* **Shikimori URL:** [${rate.anime.name}](https://shikimori.me${rate.anime.url})
    \n`;

			// Image
			finalString += `![${rate.anime.name}](https://shikimori.me${rate.anime.image.original})\n`;

			return finalString;
		}));

		return formattedRates.join('\n');
	}

	async syncShikimoriLists() {
		if (!this.settings.accessToken) {
			console.error("Access token not set. Please authenticate first.");
			return;
		}

		try {
			// Example of fetching and processing anime rates
			// @ts-ignore
			let animeRates: Array<UserRateExtended<AnimeBasic>> = await this.shikimoriClient.users.animeRates(
				{censored: false, id: "SolAstri", limit: 100, page: 0, status: "completed"}
			);
			// do not use console.log, use Notice instead
			notify(this, `Fetched anime rates from Shikimori`, 5000);
			console.log(animeRates); // animerates is an array of anime rates
			animeRates.forEach((rate) => {
				console.log(rate.anime.name);
			});
            // let's order them by user score
			animeRates.sort((a, b) => b.score - a.score);

			// let's try to save the data to a new file
			let file = this.app.vault.getAbstractFileByPath('test.md');
			if (file instanceof TFile) {
				await this.app.vault.modify(file, `# Anime rates\n\n${await this.formatAnimeRates(animeRates)}`);
			} else {
				// create a new file
				file = await this.app.vault.create('test.md', `# Anime rates\n\n${await this.formatAnimeRates(animeRates)}`);
				if (file instanceof TFile) {
					await this.app.vault.modify(file, await this.formatAnimeRates(animeRates));
				}
			}
		} catch (error) {
			console.error("Failed to sync Shikimori lists:", error);
		}
	}

	async loadPluginSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async savePluginSettings() {
		await this.saveData(this.settings);
	}

	async redirectToAuthPage() {
		const clientId = this.settings.clientId;
		const redirectUri = encodeURIComponent('https://wtf.daninc.ru/shikimori/auth-callback');
		const authUrl = `https://shikimori.one/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=`;

		// Create a notice with a message instructing the user
		const notice = new Notice('Click the button below to authorize.', 0); // 0 makes the notice persistent

		// Create a div element to hold the link button
		const div = document.createElement('div');
		div.style.marginTop = '10px'; // Add some spacing above the button

		// Create a button element
		const button = document.createElement('button');
		button.textContent = 'Authorize with Shikimori';
		button.onclick = () => window.open(authUrl); // Open the auth URL in the default browser
		div.appendChild(button); // Add the button to the div

		// Append the div to the notice's content element
		notice.noticeEl.appendChild(div);
	}


	async exchangeCodeForToken(authorizationCode: string) {
		try {
			console.log(authorizationCode);
			const accessTokenResponse = await ShikimoriAuth({
				clientId: this.settings.clientId,
				clientSecret: this.settings.clientSecret,
				redirectURI: 'https://wtf.daninc.ru/shikimori/auth-callback',
			}).getAccessToken(authorizationCode);

			this.settings.accessToken = accessTokenResponse.access_token as string;
			this.settings.refreshToken = accessTokenResponse.refresh_token;
			await this.savePluginSettings();
			this.configureClient();
		} catch (error) {
			new Notice('Failed to exchange authorization code for token.');
			console.error("Failed to exchange authorization code for token:", error);
		}
	}

	async refreshTokenIfNeeded() {
		if (!this.settings.refreshToken) {
			new Notice('Refresh token is not set. Please authenticate again.');
			return;
		}

		try {
			const newTokenResponse = await ShikimoriAuth({
				clientId: this.settings.clientId,
				clientSecret: this.settings.clientSecret,
			}).refreshAccessToken(this.settings.refreshToken);

			this.settings.accessToken = newTokenResponse.access_token as string;
			this.settings.refreshToken = newTokenResponse.refresh_token;
			await this.savePluginSettings();
			this.configureClient();
		} catch (error) {
			new Notice('Failed to refresh access token.');
			console.error("Failed to refresh access token:", error);
		}
	}

	configureClient() {
		if (this.settings.accessToken) {
			this.shikimoriClient.setAccessToken(this.settings.accessToken);
		}
	}
}

interface PersistentNotice {
	notice: Notice;
	message: string;
}
let persistentNotices: PersistentNotice[] = [];

// Show notification and log message into console.
export function notify(plugin: ObsidianShikimoriPlugin, message: string, timeout?: number) {
	const notice = new Notice(message);
	persistentNotices.push({notice, message});
	if (timeout) {
		setTimeout(() => {
			notice.hide();
		}, timeout);
	}
}

class ObsidianShikimoriSettingTab extends PluginSettingTab {
	plugin: ObsidianShikimoriPlugin;

	display() {
		const { containerEl } = this;
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
			.setName('Authorization Code')
			.setDesc('Paste the authorization code here')
			.addText(text => text
				.setPlaceholder('Enter the authorization code')
				.onChange((value) => {
					// Placeholder for user input, actual exchange should be triggered by a button or other means
				}));

		new Setting(containerEl)
			.setName('Exchange Authorization Code')
			.setDesc('Exchange the authorization code for an access token.')
			.addButton(button => button
				.setButtonText('Exchange')
				.onClick(async () => {
					// Assuming the authorization code is temporarily stored or directly obtained from the input field
					if (this.containerEl === null) {
						return;
					}
					this.containerEl = containerEl as HTMLElement;
					// @ts-ignore
					const authorizationCode = containerEl.querySelector('input[placeholder="Enter the authorization code"]').value;
					if (authorizationCode) {
						await this.plugin.exchangeCodeForToken(authorizationCode);
					} else {
						new Notice('Authorization code is empty.');
					}
				}));
	}
}

