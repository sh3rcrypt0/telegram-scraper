import type { Chat, Reply, Listener } from '~/typings/structs';
import { codeblock, getContent, getFiles } from '~/utilities';
import type { NewMessageEvent } from 'telegram/events';
import { type APIEmbed } from 'discord-api-types/v10';
import { Client, Webhook } from '~/structures';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram';
import config from '~/config';


Client.addEventHandler(onMessage, new NewMessage());

const recentScans: Set<string> = new Set();
const recentTrades: Set<string> = new Set();
const SCAN_HISTORY_LIMIT = 10;
const TRADE_HISTORY_LIMIT = 100;


function getAddress(message) {
	message = String(message);
	const cashtagPattern = /\$\w+/g;
	const addressPatterns = {
        'sui': /\b0x[A-Za-z0-9]{64}::/g,
		'ethereum': /\b0x[a-fA-F0-9]{40}\b/g,
		'hyperliquid': /\b0x[a-fA-F0-9]{32}\b/g,
		'solana': [/[A-Za-z0-9]{39,40}pump/g, /\b[A-Za-z0-9]{44}\b/g, /\b[A-Za-z0-9]{43}\b/g],
		'ton': /\bE[A-Za-z0-9_-]{47}\b/g,
		'tron': /\bT[A-Za-z0-9_-]{33}\b/g,
		'cardano': /\b[A-Za-z0-9]{56}\b/g,
		'xrpl': /\b\w+\.[A-Za-z0-9]{34}\b/g,
	};



	// Check for address first
	for (const [chain, pattern] of Object.entries(addressPatterns)) {
		if (Array.isArray(pattern)) {
			for (const p of pattern) {
				const addresses = [...message.matchAll(p)].map(match => match[0]);
				if (addresses.length) {
					const address = getMostFrequent(addresses);
					return [address, chain];
				}
			}
		} else {
			const addresses = [...message.matchAll(pattern)].map(match => match[0]);
			if (addresses.length) {
				const address = getMostFrequent(addresses);
				return [address, chain];
			}
		}
	}

	// If no address is found, check for cashtag
	const cashtags = [...message.matchAll(cashtagPattern)].map(match => match[0]);
	if (cashtags.length) {
		const tokenAddress = cashtags[0].slice(1); // Remove the dollar sign
		return [tokenAddress, "cashtag"];
	}

	return [null, null];
}


function getMostFrequent(arr) {
	return arr.reduce((a, b, _, arr) =>
		arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
	);
}


function getWalletAddress(message) {
    // Extract addresses from text links in entities
    const addressList = message.entities
        ?.filter(entity => entity.className === 'MessageEntityTextUrl')
        ?.map(entity => entity.url?.split('/')?.pop())
        ?.filter(Boolean) || [];

    if (!addressList.length) return { cielo: null, tokenAddress: null };

    const walletAddress = addressList[0];

    return walletAddress;
}


function processCielo(message, tokenAddress) {
    // Extract hashtag entities with numbers
	let type = 'bot';
	const walletLabel = message.message.split('\n')[0].replace(/#/g,'').replace(/=/g,'').replace(/\+/g,'_').replace(/ /g,'_');
    const pattern = /(\d+(?:,\d+)*(?:\.\d+)?) (#\w+)/g;
    const hashtagEntities = [...message.message.matchAll(pattern)];
	const price_per_token = parseFloat(message.message.split(' | ')[0].split('@').pop()?.replace('$','') || '0')
    
    if (!hashtagEntities.length) {
        return null;
    }

    const hashEntity = hashtagEntities[0][2] || '';
    
    // Get addresses from entities
    const walletAddress = getWalletAddress(message);
    
    // Determine transaction type and details
    const primaryTokenList = {
        '#WETH': 'ETH',
        '#ETH': 'ETH',
        '#SOL': 'SOL',
        '#USDC': 'USDC',
        '#USDT': 'USDT',
        '#WMATIC': 'MATIC',
        '#FTM': 'FTM',
        '#BNB': 'BNB'
    };
    
    let amount, currency;
    
    if (primaryTokenList[hashEntity]) {
		type = 'buy';
        amount = parseFloat(hashtagEntities[0][1].replace(/,/g, ''));
        currency = primaryTokenList[hashEntity];
    } else {
		type = 'sell';
        const lastEntity = hashtagEntities[hashtagEntities.length - 1];
        amount = parseFloat(lastEntity[1].replace(/,/g, ''));
        currency = primaryTokenList[lastEntity[2]] || 'UNKNOWN';
    }
	if (message.message.includes('🔴')) {
		type = 'sell';
	} else if (message.message.includes('🟢')) {
		type = 'buy';
	}

    const context = {
        wallet_address: walletAddress,
        username: walletLabel, 
        amount: amount,
        currency: currency,
		price_per_token: price_per_token,
        url: `https://app.cielo.finance/profile/${walletAddress}?tokens=${tokenAddress}`,
        args: message.message // Original message as additional context
    };

    const uid = `${walletAddress}:${tokenAddress}`.toLowerCase();
    
    // if (!recentTrades.has(uid)) {
    //     // Add to tracking set
    //     recentTrades.add(uid);
    //     if (recentTrades.size > TRADE_HISTORY_LIMIT) {
    //         const firstItem = recentTrades.values().next().value;
    //         recentTrades.delete(firstItem);
    //     }

    // }
	
	return { type, context };
    // return null;
}


async function processMessage(chatId, username, guildname, message, type) {	
	const messageText = message.message || '';
	const entities = message.entities || [];
	const textWithLinks = entities
		.filter(entity => entity.className === 'MessageEntityTextUrl')
		.map(entity => entity.url?.split('/')?.pop())
		.filter(Boolean);
	
	const fullMessage = [messageText, ...textWithLinks].join(' ');
	const [address, chain] = getAddress(fullMessage);

	if (typeof type === 'object' && type !== null) {
		const keys = Object.keys(type);
		for (const key of keys) {
			if (fullMessage.includes(key)) {
				type = type[key]; // Assign the value corresponding to the found key
				break; // Exit loop after the first match
			}
		}
	}

	if (address) {
		const scanKey = `${username}:${address}`.toLowerCase();
		
		// if (!recentScans.has(scanKey)) {
			// recentScans.add(scanKey);
			// if (recentScans.size > SCAN_HISTORY_LIMIT) {
			// 	const firstItem = recentScans.values().next().value;
			// 	recentScans.delete(firstItem);
			// }
			
		if (!type) {
			const callerKeywords = ['call', 'gamble', 'playground'];
			type = username.toLowerCase().includes('bot') ? 'bot' : 
					callerKeywords.some(keyword => guildname.toLowerCase().includes(keyword)) ? 'caller' : 'scan'
		}
		
		let context;
		context = {
			username: username,
			guildname: guildname,
			url: `https://t.me/c/${chatId.toString().replace('-100', '')}/${message.id}`,
			args: messageText,
		};
		
		if (fullMessage.toLowerCase().includes('cielo')) {
			({ type, context } = processCielo(message, address));
		}				

		const payload = {
			type,
			chain,
			token_address: address,
			context,
			timestamp: Date.now()
		};

		try {
			await fetch('https://istory.ai/create/history', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});
		} catch (err) {
			console.error('Failed to send to istory.ai:', err);
		}

		console.log(`Found ${chain} address: ${address} from ${username} (${guildname})`);
		// }
	}
}


async function onMessage({ message, chatId }: NewMessageEvent & { chat: Chat; }) {
	const author = await message.getSender() as Api.User;
	const chat = await message.getChat() as Chat & { hasLink: boolean; broadcast: boolean; };
	if (!chat || !author) return;

	const usernames = [...(author.usernames?.map(u => u?.username) ?? []), author.username, author?.id?.toString()].filter(Boolean);

	if (usernames.length && usernames.some(u => config.messages.blacklist.includes(u))) {
		Client._log.info('Preventing forward of blacklisted user: ' + usernames.join(' or '));
		return;
	}

	// @ts-ignore
	const isDM = chat.className === 'User';
	const isForum = chat.forum;
	const isLinked = chat.hasLink || chat.broadcast;

	const listeners = (config.listeners as Listener[]).filter(listener => {
		if (listener.users?.length && !usernames.some(u => listener.users?.includes(u))) {
			return false;
		}

		if (listener.group && listener.group != chatId.toString()) {
			return false;
		}

		if (!listener.commands && message.message.startsWith('/')) {
			return false;
		}

		return true;
	});
	
	// Only check groups and private chats
	if (!isLinked && !author?.bot) {
		let username = author?.username || author?.firstName || '';
		let guildname = chat?.title || '';
		await processMessage(chatId, username, guildname, message, 'scan');
	} 

	// If no listeners, return
	if (!listeners.length) return;
	Client._log.info(`New message from ${chatId}:${author?.username ?? chat?.title}:${author?.id ?? chat?.id} - Channel Type: ${isForum ? 'Forum' : isLinked ? 'Linked' : 'Group/Private'}`);


	if (isForum) {
		const reply = await message.getReplyMessage() as Reply;

		for (const listener of listeners.filter(l => l.forum || (!l.group && l.users?.length)) as Listener[]) {
			if (listener.whitelistOnly && !(listener.whitelist ?? []).includes(chatId.toString())) continue;
			if (!listener.whitelistOnly && (listener.blacklist ?? []).includes(chatId.toString())) continue;
			if (!listener.stickers && message.sticker) continue;
			if (isDM && !listener.allowDMs) continue;

			onForumMessage({ message, chat, chatId, author, reply, listener, usernames });
			
			if (listener.forwardTo) {
				const chat = await Client.getEntity(listener.forwardTo);
				if (!chat) continue;

				await message.forwardTo(chat);
			}
		}
	} else if (isLinked) {
		for (const listener of listeners.filter(l => chat.hasLink ? l.linked : true || (!l.group && l.users?.length)) as Listener[]) {
			if (listener.whitelistOnly && !(listener.whitelist ?? []).includes(chatId.toString())) continue;
			if (!listener.whitelistOnly && (listener.blacklist ?? []).includes(chatId.toString())) continue;
			if (!listener.stickers && message.sticker) continue;
			if (isDM && !listener.allowDMs) continue;

			onLinkedMessage({ message, chat, chatId, author, listener, usernames });

			if (listener.forwardTo) {
				const chat = await Client.getEntity(listener.forwardTo);
				if (!chat) continue;

				await message.forwardTo(chat);
			}
		}
	} else {
		for (const listener of listeners.filter(l => !l.forum || (!l.group && l.users?.length)) as Listener[]) {
			if (listener.whitelistOnly && !(listener.whitelist ?? []).includes(chatId.toString())) continue;
			if (!listener.whitelistOnly && (listener.blacklist ?? []).includes(chatId.toString())) continue;
			if (!listener.stickers && message.sticker) continue;
			if (isDM && !listener.allowDMs) continue;

			onGroupMessage({ message, chat, chatId, author, listener, usernames });

			if (listener.forwardTo) {
				const chat = await Client.getEntity(listener.forwardTo);
				if (!chat) continue;

				await message.forwardTo(chat);
			}
		}
	}
	// Client._log.info(`[END2] ${chatId}:${author?.username ?? chat?.title}:${author?.id ?? chat?.id} - Channel Type: ${isForum ? 'Forum' : isLinked ? 'Linked' : 'Group/Private'}`);

}

interface HandlerArguments {
	chatId: bigInt.BigInteger;
	message: Api.Message;
	usernames: string[];
	listener: Listener;
	author: Api.User;
	chat: Chat;
}

async function onForumMessage({ message, author, chat, chatId, reply, listener, usernames }: HandlerArguments & { reply: Reply; }) {
	if (!listener.stickers && message.sticker) return;

	const hasReply = !reply?.action;
	const isTopic = reply?.replyTo?.forumTopic ?? false;
	const topicId = reply?.replyTo?.replyToTopId ?? reply?.replyTo?.replyToMsgId;

	const [topic] = (isTopic ? await Client.getMessages(chatId, { ids: [topicId] }) : [reply]) as Reply[];

	const channel = listener.channels?.find((payload) => {
		if (payload.name === topic?.action?.title) {
			return true;
		}

		if (payload.main && !topic?.action?.title) {
			return true;
		}

		return false;
	});

	if ((listener.channels.length && !channel) || (!listener.users?.length && !listener.channels?.length)) return;

	const files = await getFiles(message);

	if (!message.rawText && !files.length) return;

	const replyAuthor = await reply?.getSender?.() as Api.User;
	if (listener.repliesOnly && !replyAuthor) return;

	const replyAuthorUsernames = [...(replyAuthor?.usernames ?? []), replyAuthor?.username, replyAuthor?.id?.toString()].filter(Boolean);

	if (listener.replyingTo && !listener.replyingTo?.some(t => replyAuthorUsernames.includes(t))) return;

	const sites = `(${config.messages.allowedEmbeds.map(r => r.replaceAll('.', '\\.')).join('|')})`;
	const embeddable = new RegExp(`https?:\/\/(www\.)?${sites}([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)`, 'mi');
	const link = listener.dontEmbedSingularLinks && message.rawText?.match(embeddable);
	const isSingularLink = link && message.rawText.length === link[0].length;

	const shouldEmbed = !isSingularLink && typeof listener.embedded === 'boolean' && listener.embedded;
	const shouldEmbedUser = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && usernames.some(u => (listener.embedded as string[])!.includes(u as string));
	const shouldEmbedReply = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && replyAuthorUsernames.some(u => (listener.embedded as string[])!.includes(u as string));
	const shouldShowReply = listener.showReplies ?? true;

	const replyText = replyAuthor && hasReply && `> \`${replyAuthor?.firstName + ':'}\` ${getContent(reply, listener, channel)}`.split('\n').join('\n> ');
	const messageText = `${!(listener.showUser ?? false) ? codeblock((author?.firstName ?? chat.title) + ':') : ''} ${message.rawText && getContent(message, listener, channel)}`;

	const content = [
		listener.mention ? '@everyone' : '',
		message.forward && `__**Forwarded from ${(message.forward.sender as Api.User).username}**__`,
		(!shouldEmbedReply && shouldShowReply) ? replyText : '',
		messageText
	].filter(Boolean).join('\n').trim();


	const embed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: content
	};

	const replyEmbed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: replyText
	};

	if (shouldEmbed || shouldEmbedUser || shouldEmbedReply) {
		Webhook.send(channel?.webhook ?? listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : (listener.includeForumChannelName && channel.name ? `${chat.title} -> ${channel.name}` : chat.title)),
			content: shouldEmbedReply ? content : '',
			embeds: [!shouldEmbedReply && shouldShowReply ? embed : replyEmbed]
		}, files);
	} else {
		Webhook.send(channel?.webhook ?? listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : (listener.includeForumChannelName && channel.name ? `${chat.title} -> ${channel.name}` : chat.title)),
			content
		}, files);
	}
	let username = author?.username || author?.firstName || '';
	let guildname = listener.name || chat?.title || '';
	const type = listener.type || 'bot';
	await processMessage(chatId, username, guildname, message, type);
}

async function onLinkedMessage({ message, author, chat, chatId, usernames, listener }: HandlerArguments) {
	const files = await getFiles(message);
	if (!message.rawText && !files.length) return;
	if (!listener.stickers && message.sticker) return;

	const reply = await message.getReplyMessage() as Reply;
	const replyAuthor = await reply?.getSender() as Api.User;
	const replyAuthorUsernames = [...(replyAuthor?.usernames ?? []), replyAuthor?.username, replyAuthor?.id?.toString()].filter(Boolean);

	if (listener.replyingTo && !listener.replyingTo?.some(t => replyAuthorUsernames.includes(t))) return;

	const sites = `(${config.messages.allowedEmbeds.map(r => r.replaceAll('.', '\\.')).join('|')})`;
	const embeddable = new RegExp(`https?:\/\/(www\.)?${sites}([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)`, 'mi');
	const link = message.rawText?.match(embeddable);
	const isSingularLink = link && message.rawText.length === link[0].length;

	const shouldEmbed = !isSingularLink && typeof listener.embedded === 'boolean' && listener.embedded;
	const shouldEmbedUser = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && usernames.every(u => (listener.embedded as string[])!.includes(u));
	const shouldEmbedReply = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && replyAuthorUsernames.every(u => (listener.embedded as string[]).includes(u.toString()));
	const shouldShowReply = listener.showReplies ?? true;

	const replyText = replyAuthor && `> \`${replyAuthor?.firstName + ':'}\` ${getContent(reply, listener)}`.split('\n').join('\n> ');
	const messageText = `${!(listener.showUser ?? false) ? codeblock((author?.firstName ?? chat.title) + ':') : ''} ${getContent(message, listener)}`;

	const content = [
		listener.mention ? '@everyone' : '',
		message.forward && `__**Forwarded from ${(message.forward.sender as Api.User)?.username ?? 'Unknown'}**__`,
		(!shouldEmbedReply && shouldShowReply) ? replyText : '',
		messageText
	].filter(Boolean).join('\n').trim();

	const embed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: content
	};

	const replyEmbed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: replyText
	};

	if (shouldEmbed || shouldEmbedUser || shouldEmbedReply) {
		Webhook.send(listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : chat.title),
			content: shouldEmbedReply ? content : '',
			embeds: [!shouldEmbedReply ? embed : replyEmbed]
		}, files);
	} else {
		Webhook.send(listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : chat.title),
			content
		}, files);
	}
	let username = author?.username || author?.firstName || '';
	let guildname = listener.name || chat?.title || '';
	const type = listener.type || 'bot';
	await processMessage(chatId, username, guildname, message, type);
}

async function onGroupMessage({ message, author, usernames, chat, chatId, listener }: HandlerArguments) {
	const user = listener.users?.find?.(user => usernames.some(u => user === u));
	if (listener.users?.length && !user) return;
	if (!listener.stickers && message.sticker) return;

	const files = await getFiles(message);

	if (!message.rawText && !files.length) return;

	const reply = await message.getReplyMessage() as Reply;
	const replyAuthor = await reply?.getSender() as Api.User;
	const replyAuthorUsernames = [...(replyAuthor?.usernames ?? []), replyAuthor?.username, replyAuthor?.id?.toString()].filter(Boolean);

	if (listener.replyingTo && !listener.replyingTo?.some(t => replyAuthorUsernames.includes(t))) return;

	const sites = `(${config.messages.allowedEmbeds.map(r => r.replaceAll('.', '\\.')).join('|')})`;
	const embeddable = new RegExp(`https?:\/\/(www\.)?${sites}([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)`, 'mi');
	const link = message.rawText?.match(embeddable);
	const isSingularLink = link && message.rawText.length === link[0].length;

	const shouldEmbed = !isSingularLink && typeof listener.embedded === 'boolean' && listener.embedded;
	const shouldEmbedUser = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && usernames.some(u => (listener.embedded as string[])!.includes(u));
	const shouldEmbedReply = typeof listener.embedded === 'object' && Array.isArray(listener.embedded) && replyAuthorUsernames.some(u => (listener.embedded as string[])!.includes(u.toString()));
	const shouldShowReply = listener.showReplies ?? true;

	const replyText = replyAuthor && `> \`${replyAuthor?.firstName + ':'}\` ${getContent(reply, listener)}`.split('\n').join('\n> ');
	const messageText = `${!(listener.showUser ?? false) ? codeblock((author?.firstName ?? chat.title) + ':') : ''} ${getContent(message, listener)}`;

	const content = [
		listener.mention ? '@everyone' : '',
		message.forward && `__**Forwarded from ${(message.forward.sender as Api.User).username}**__`,
		(!shouldEmbedReply && shouldShowReply) ? replyText : '',
		messageText
	].filter(Boolean).join('\n').trim();

	const embed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: content
	};

	const replyEmbed: APIEmbed = {
		color: listener.embedColor ?? 16711680,
		description: replyText
	};

	if (shouldEmbed || shouldEmbedUser || shouldEmbedReply) {
		Webhook.send(listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : chat.title),
			content: shouldEmbedReply ? content : '',
			embeds: [!shouldEmbedReply ? embed : replyEmbed]
		}, files);
	} else {
		Webhook.send(listener.webhook, {
			...(listener.extraWebhookParameters ?? {}),
			username: listener.name ?? ((listener.showUser ?? false) ? `${(listener.useReplyUserInsteadOfAuthor ? replyAuthor?.username : author.username) ?? 'Unknown'} | ${chat.title ?? 'DM'}` : chat.title),
			content
		}, files);
	}
	let username = author?.username || author?.firstName || '';
	let guildname = listener.name || chat?.title || '';
	const type = listener.type || 'scan';
	await processMessage(chatId, username, guildname, message, type);
}
