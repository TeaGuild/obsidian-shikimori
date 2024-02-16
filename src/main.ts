// Import necessary modules from Obsidian and node-shikimori
import {Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import {
	AnimeBasic,
	auth as ShikimoriAuth,
	client as ShikimoriClient,
	UserRateExtended,
	UserRateStatus
} from 'node-shikimori';
import {FolderSuggest} from "./ui";
import {round} from "@popperjs/core/lib/utils/math";

interface ObsidianShikimoriSettings {
	clientId: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
	animeFolder: string;
	shikiUsername: string;
}

const DEFAULT_SETTINGS: ObsidianShikimoriSettings = {
	clientId: '',
	clientSecret: '',
	accessToken: '',
	refreshToken: '',
	animeFolder: 'Anime',
	shikiUsername: '',
}

function createSafeFolderName(name: string): string {
	return name
		.replace(/[*"^]/g, '') // Remove *, ", and ^ without replacement
		.replace(/[\/\\|?]/g, '-') // Replace /, \, |, and ? with -
		.replace(/:/g, ' -'); // Replace : with ' -' for readability
}

export default class ObsidianShikimoriPlugin extends Plugin {
	settings: ObsidianShikimoriSettings;
	shikimoriClient = ShikimoriClient({clientName: "Obsidian", maxCallsPerMinute: 200, maxCallsPerSecond: 25});

	async onload() {
		await this.loadPluginSettings();

		// Initialize Shikimori client with access token if available
		if (this.settings.accessToken) {
			this.shikimoriClient.setAccessToken(this.settings.accessToken);
		}

		this.addSettingTab(new ObsidianShikimoriSettingTab(this.app, this));

		// Add command to sync all Shikimori lists
		this.addCommand({
			id: 'sync-shikimori-lists',
			name: 'Sync Shikimori Lists',
			callback: () => this.syncShikimoriLists(),
		});

		// Add command to sync specific Shikimori lists
		this.addCommand({
			id: 'sync-specific-list',
			name: 'Sync Specific List',
			callback: () => {
				// TODO: Add a modal to select the list to sync
				let statuses: UserRateStatus[] = ['watching'];
				this.syncShikimoriLists(statuses);
			},
		});

		// Add command to authenticate with Shikimori
		this.addCommand({
			id: 'authenticate-with-shikimori',
			name: 'Authenticate with Shikimori',
			callback: () => this.redirectToAuthPage(),
		});

		this.addCommand({
			id: 'refresh-access-token',
			name: 'Refresh Access Token',
			callback: () => this.refreshTokenIfNeeded(),
		});
	}

	async formatAnimeRates(animeRates: any): Promise<string> {
		const oneWeek = 7 * 24 * 60 * 60 * 1000;
		// @ts-ignore
		const formattedRates = await Promise.all(animeRates.map(async (rate) => {
			let airingStartDate = new Date(rate.anime.aired_on);
			let airingEndDate = rate.anime.released_on ? new Date(rate.anime.released_on) : null;
			let episodesAired = rate.anime.episodes_aired || rate.anime.episodes;
			let nextEpisodeNumber = rate.episodes + 1 > episodesAired ? null : rate.episodes + 1;
			let nextEpisodeDate = nextEpisodeNumber ? new Date(airingStartDate.getTime() + nextEpisodeNumber * oneWeek) : null;

			let yamlParts = ['---'];
            // System Info
			yamlParts.push(`shikimori_id: ${rate.anime.id}`);
			yamlParts.push(`shikimori_url: https://shikimori.me${rate.anime.url}`);
			yamlParts.push(`mal_id: ${rate.anime.myanimelist_id}`);

			// Aliases
			let aliases = [];

			// Add Russian name at the top if it exists
			if (rate.anime.russian) aliases.push(`${rate.anime.russian}`);

			// Merge English, Synonyms, and Japanese names
			let otherNames = [
				...(rate.anime.english || []),
				...(rate.anime.synonims || []),
				...(rate.anime.japanese || [])
			];

			// Add other names to aliases list
			otherNames.forEach(name => aliases.push(`"${name}"`));

			yamlParts.push(`aliases: [${aliases.join(', ')}]`);

			// Genres
			// @ts-ignore
			let genres = rate.anime.genres.map(g => `"${g.name}"`).join(', ');
			yamlParts.push(`genres: [${genres}]`);

			// Other properties
			yamlParts.push(`rating: "${rate.anime.rating}"`);
			yamlParts.push(`aired_on: "${rate.anime.aired_on}"`);
			yamlParts.push(`released_on: "${rate.anime.released_on}"`);
			yamlParts.push(`episodes: ${rate.anime.episodes}`);
			yamlParts.push(`duration: ${rate.anime.duration}`);
			// @ts-ignore
			let studios = rate.anime.studios.map(s => `"${s.name}"`).join(', ');
			yamlParts.push(`studio: [${studios}]`);
			yamlParts.push(`score: ${rate.anime.score}`);
			yamlParts.push(`status: "${rate.anime.status}"`);

			// User Info
			yamlParts.push(`user_score: ${rate.score}`);
			yamlParts.push(`user_status: "${rate.status}"`);
			yamlParts.push(`user_created: ${rate.created_at}`);
			yamlParts.push(`user_updated: ${rate.updated_at}`);
			yamlParts.push(`episodes_watched: ${rate.episodes}`);
			yamlParts.push(`rewatches: ${rate.rewatches}`);
			// Close the YAML frontmatter block
			yamlParts.push('---\n');

			// Combine all parts into the final YAML frontmatter string
			let yamlFrontMatter = yamlParts.join('\n');

			let finalString = `# ${rate.anime.name}\n\n`;

			// Adding English and Russian Titles as aliases
			if (rate.anime.english && rate.anime.english.length > 0) {
				finalString += `*${rate.anime.english[0]}*\n\n`;
			}
			if (rate.anime.russian) {
				finalString += `*${rate.anime.russian}*\n\n`;
			}

			// Basic Information
			finalString += `## Basic Information\n\n`;
			finalString += `- ${rate.anime.aired_on} to ${airingEndDate ? rate.anime.released_on : "Present"}\n`;
			// Genres using callouts for emphasis
			finalString += `- **Genres:** ${rate.anime.genres.map(g => `[[${g.name}]]`).join(", ")}\n`;

			// Highlight the rating
			finalString += `- **Rating:** ==${rate.anime.rating}==\n`;

			// Episodes watched visualized with HTML progress tag
			let episodesWatchedPercentage = Math.round((rate.episodes / rate.anime.episodes) * 100);
			finalString += `- **Episodes:** <progress value="${rate.episodes}" max="${rate.anime.episodes}"></progress> (${episodesWatchedPercentage}% - ${rate.episodes}(${episodesAired}) / ${rate.anime.episodes}) <br>\n`;

			// Duration, Studio, Score, and Status sections
			finalString += `- **Duration:** ${rate.anime.duration} minutes per episode; in total ${round(rate.anime.duration * rate.anime.episodes / 60)} hours\n`;
			finalString += `- **Studio:** ${rate.anime.studios.map(s => `[[${s.name}]]`).join(", ")}\n`;
			finalString += `- **User Score:** ==${rate.score}== / **Anime Score:** ==${rate.anime.score}==\n`;
			finalString += `- **Status:** ${rate.status}\n`;
			finalString += `- *[Shikimori URL](https://shikimori.me${rate.anime.url})*\n\n`;
			finalString += `![](https://shikimori.me/${rate.anime.image.original})\n\n`;

			// Description as a block reference
			finalString += `## Description\n\n${rate.anime.description_html}\n\n`;

			// Media Links
			if (rate.anime.videos && rate.anime.videos.length > 0) {
				finalString += `## Media Links\n\n`;
				rate.anime.videos.forEach((video: { url: string | string[]; name: any; }) => {
					if (video.url.includes("youtube.com") || video.url.includes("youtu.be")) {
						finalString += `![](${video.url})\n`;
					} else {
						finalString += `- [${video.name || "Video"}](${video.url})\n`;
					}
				});
			}

			// Screenshots
			if (rate.anime.screenshots && rate.anime.screenshots.length > 0) {
				finalString += `## Screenshots\n\n`;
				// @ts-ignore
				rate.anime.screenshots.forEach(screenshot => {
					finalString += `![](https://shikimori.me${screenshot.original})\n`;
				});
				finalString += `\n`;
			}

			return yamlFrontMatter + finalString;
		}));

		return formattedRates.join('\n\n---\n\n');
	}

	async syncShikimoriLists(statuses: UserRateStatus[] = ['planned', 'watching', 'completed', 'rewatching', 'on_hold', 'dropped']) {
		if (!this.settings.accessToken) {
			console.error("Access token not set. Please authenticate first.");
			return;
		}

		for (let status of statuses) {
			notify(this, `Fetching ${status} anime rates from Shikimori...`, 5000);

			try {
				let animeRates: UserRateExtended<AnimeBasic>[] = [];
				let page = 0;
				let fetchedRates: UserRateExtended<AnimeBasic>[];

				do {
					// @ts-ignore
					fetchedRates = await this.shikimoriClient.users.animeRates(
						{censored: false, id: "SolAstri", limit: 100, page: page++, status: status as UserRateStatus},
					);
					animeRates.push(...fetchedRates);
				} while (fetchedRates.length === 100);

				animeRates.sort((a, b) => b.score - a.score);

				for (let rate of animeRates) {
					rate.anime = await this.fetchAnimeInfo(rate.anime.id);
					const formattedAnimeData = await this.formatAnimeRates([rate]);
					const safeFolderName = createSafeFolderName(rate.anime.name);
					const folderPath = `${this.settings.animeFolder}/${status}/${safeFolderName}`;

					if (!this.app.vault.getAbstractFileByPath(folderPath)) {
						await this.app.vault.createFolder(folderPath);
					}

					const filePath = `${folderPath}/${safeFolderName}.md`;
					let file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.app.vault.modify(file, formattedAnimeData);
					} else {
						await this.app.vault.create(filePath, formattedAnimeData);
					}

					notify(this, `Synced ${status} Shikimori lists.`, 5000);

				}
			} catch (error) {
				console.error(`Failed to sync ${status} Shikimori lists:`, error);
				notify(this, `Failed to sync ${status} Shikimori lists.`, 5000);
			}
		}
	}

	async fetchAnimeInfo(id: number) {
		while (true) {
			try {
				const result = await this.shikimoriClient.animes.byId({id: id});
				console.log(result);
				return result;
			} catch (error) {
				console.error("Failed to fetch anime info:", error);
				console.error("Retrying in 1 second...");
				await new Promise(r => setTimeout(r, 1000));
			}
		}
	}

	async getRelatedAnime(id: number) {
		while (true) {
			try {
				return await this.shikimoriClient.animes.related({id: id});
			} catch (error) {
				console.error("Failed to fetch related anime:", error);
				console.error("Retrying in 1 second...");
				await new Promise(r => setTimeout(r, 1000));
			}
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

		containerEl.createEl('h2', {text: 'General Settings'});
		new Setting(containerEl)
			.setName("Anime directory")
			.setDesc("Anime notes would be placed here")
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text.setValue(this.plugin.settings.animeFolder)
					.onChange(async value => {
						this.plugin.settings.animeFolder = value;
						await this.plugin.savePluginSettings();
					})
			});

		containerEl.createEl('h2', {text: 'Shikimori Settings'});
		containerEl.createEl('p', {text: 'Please provide your Shikimori client ID and client secret to authenticate with Shikimori.'});

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

		new Setting(containerEl)
			.setName('Shikimori Username')
			.setDesc('Enter your Shikimori username')
			.addText(text => text
				.setValue(this.plugin.settings.shikiUsername || '')
				.setPlaceholder('Your Shikimori username')
				.onChange(async (value) => {
					this.plugin.settings.shikiUsername = value;
					await this.plugin.savePluginSettings();
				}))
			// we can also get the current user via node-shikimori whoami
			.addButton(button => button
				.setButtonText('Get Username')
				.onClick(async () => {
					if (!this.plugin.settings.accessToken) {
						new Notice('Access token is not set. Please authenticate first.');
						return;
					}
					try {
						const user = await this.plugin.shikimoriClient.users.whoami();
						this.plugin.settings.shikiUsername = user.nickname;
						await this.plugin.savePluginSettings();
						new Notice(`Username set to ${user.nickname}`);
						// and update the input field
						// @ts-ignore
						this.containerEl.querySelector('input[placeholder="Your Shikimori username"]').value = user.nickname;
					} catch (error) {
						new Notice('Failed to fetch username.');
						console.error("Failed to fetch username:", error);
					}
				}));
	}
}

