
// Tucker - July 2019: A node.js program designed to scrape a website for data, look for new information, and then notify me using IFTTT
// I'm using a "state" based continuous loop model. The tick rate is adjustable and the loop runs constantly, checking the state each time.
// The state is changed using functions and callbacks.

// npm install: request
// https://www.npmjs.com/package/request

(function () {
	'use strict';
	// i'm going to be using 'request' to pull HTML data from a website
	const request = require('request');
	const HTMLParser = require('node-html-parser');

	// CONFIGURATION data (could be moved to a JSON file)
	let scrapeTargetURL = 'http://matttucker.com/doodle.html';
	scrapeTargetURL = 'https://www.doodlerockrescue.org/drr/our-mission/';
	let targetElementId = 'black-studio-tinymce-6';
	let storeJSONfile = 'doggyData.json';
	let iftttKeys = ['IFTTTkeygoeshere']; // this is the key we use for sending a notification through IFTTT

	const $looper = (function () {
		let that;
		const fs = require('fs');
		return {
			// that: null,
			setTimeOutRate: 1000, // this is the tick rate of the stateLoop, in millisec
			timeBetweenReset: 1000 * 60 * 15, // basically time between Scraping for new data. Ideally 15 min (1000 * 60 * 15)
			startMark: null,
			gameState: 'reset',
			smoketest: 'heynowsky',
			parsedDogsObject: {}, // this object will hold the dog data Parsed&Scraped from offsite
			storedDogsObject: {}, // this object will hold the dog data Stored locally
			newDogsObject: {}, // this object will hold ONLY the new dogs found to be  sent in notification
			readStarted: false, // have we called the Read function yet?
			requestStarted: false, // have we called the Request function yet?
			// INIT
			initThis: function () {
				that = this;
				console.log('\u001b[2J\u001b[0;0H'); // these clear the console and shift cursor to top
				console.log('gamestate: >>>>>>>>> ' + this.gameState);
				console.log(that);
				this.heynow();
			},
			heynow: function () {
				console.info('heynow = ' + this.smoketest);
			},
			main: function () {
				that.stateLoop();
				setTimeout(that.main, that.setTimeOutRate);
			},
			stateLoop: function () {
				console.log('gamestate: >>>>>>>>> ' + that.gameState);

				switch (that.gameState) {
				case 'reset':
					// start from the top, clear anything and everything
					// then start with "request"
					that.startMark = Date.now();
					that.readStarted = false;
					that.requestStarted = false;
					that.parsedDogsObject = {};
					that.storedDogsObject = {};
					that.newDogsObject = {};
					that.gameState = 'whatNow';
					break;
				case 'read':
					// do read the stored dog array
					that.readDoggyData();
					that.gameState = 'whatNow';
					break;
				case 'request':
					// do request for data. we should then wait for the callback to trigger
					that.requestNewScrape();
					that.gameState = 'whatNow';
					break;
				case 'compare':
					// at this point we have new Read and new Request, so we can start our comparison
					that.compareStoredAndParsed();
					break;
				case 'waitForNextRound':
					// after some designated time, we will start the search for new dogs again, we will call that 'reset'
					that.testForReset();
					// console.log( (Date.now() - that.startMark) / 1000);
					break;
				case 'whatNow':
					// what do we do now? read? request? wait?
					switch (true) {
					case that.requestStarted === false:
						that.gameState = 'request';
						break;
					case that.readStarted === false:
						that.gameState = 'read';
						break;
					case that.checkRequestReadComplete():
						that.gameState = 'compare';
						break;
					}
					break;
				case 'saveAndNotify':
					// save parsed results and the notify users
					that.writeDoggyData();
					that.sendNotifications();
					that.gameState = 'waitForNextRound';
					break;
				}
			},
			testForReset: function () {
				if ((Date.now() - that.startMark) > that.timeBetweenReset) {
					that.gameState = 'reset';
					console.log('DO RESET NOW!!!!!!');
				}
			},
			readDoggyData: function () {
				that.readStarted = true;
				that.storedDogsObject = {};
				fs.readFile(storeJSONfile, (err, data) => { // storeJSONfile
					if (err) throw err; // who's catching?
					that.storedDogsObject = JSON.parse(data);
					console.log(that.storedDogsObject);
					that.gameState = (that.checkRequestReadComplete() === true) ? 'compare' : 'whatNow';
				});
			},
			writeDoggyData: function () {
				that.writeStarted = true;
				let data = JSON.stringify(that.parsedDogsObject);
				fs.writeFile(storeJSONfile, data, (err) => {
					if (err) { return console.log(err); }
					console.log('NEW dog object stored ');
				});
			},
			requestNewScrape: function () { // we will also immediately PARSE if we get data
				that.requestStarted = true;
				that.parsedDogsObject = {};
				request(scrapeTargetURL, (err, res, body) => {
					// if (err) throw err; // who's catching?
					if (err) { return console.log(err); }
					that.parsedDogsObject = that.parseMyData(body, targetElementId);
					console.dir(that.parsedDogsObject);
					that.gameState = (that.checkRequestReadComplete() === true) ? 'compare' : 'whatNow';
				});
			},
			checkRequestReadComplete: function () {
				if (Object.keys(that.parsedDogsObject).length > 0 && Object.keys(that.storedDogsObject).length > 0) {
					that.requestComplete = false;
					that.readComplete = false;
					return true;
				} else return false;
			},
			sendNotifications: function () {
				console.log('sendNotifications ');
				console.dir(that.newDogsObject);
				if (Object.keys(that.newDogsObject).length > 0) {
					for (let i = 0; i < iftttKeys.length; i++) {
						Object.keys(that.newDogsObject).forEach(key => {
							let dogName = key; // i know this is a little redundant, we could have just used "dogName" as the arg for the forEach function
							let dogURL = that.newDogsObject[key];
							that.triggerIftttWebhook('newDoodle', iftttKeys[i], dogName, dogURL);
							console.log('NOTIFY!! -foreach- how many keys? this is one :' + key + ' ' + dogURL);
						});
					}
				} else {
					console.log('Of no dogs to notify we have.');
				}
			},
			triggerIftttWebhook: function (event, key, value1, value2, value3) {
				let iftttNotificationUrl = `https://maker.ifttt.com/trigger/${event}/with/key/${key}`;
				request.post({
					url: iftttNotificationUrl,
					form: {
						value1: value1,
						value2: value2,
						value3: value3
					}
				},
				(err, httpResponse, body) => {
					if (err) { return console.log(err); }
					console.log(body);
				}
				);
			},
			parseMyData: function (htmlSample, divId) {
				// this is NOT generic at all. I know specifically that I am looking for an ID'd section, with a UL, with LIs, with Anchor tags, etc.
				let parsnip = HTMLParser.parse(htmlSample);
				let sampleIdSection = parsnip.querySelector(`#${divId}`);
				let myUl = sampleIdSection.querySelector('ul'); // console.log(myUl);
				let myLIs = myUl.querySelectorAll('li'); // console.log(myLIs);

				let dogsObject = {};

				for (let i = 0; i < myLIs.length; i++) {
					let thisDogAnchor = myLIs[i].querySelector('a'); // console.log(thisDogAnchor);
					let hrefAttr = thisDogAnchor.rawAttrs;
					// each element in aray has a key that is the dog name and the value is the url for the dog
					dogsObject[thisDogAnchor.innerHTML] = hrefAttr.substring(6, hrefAttr.length - 1);
				}
				return dogsObject;
			},
			compareStoredAndParsed: function () {
				// Iterate through the keys
				that.newDogsObject = {};
				Object.keys(that.parsedDogsObject).forEach(key => {
					if (key in that.storedDogsObject === false) { // if this Dog name is not found in the Store, it's NEW!
						// add this new dog to a notification array
						// key is dog name
						that.newDogsObject[key] = that.parsedDogsObject[key];
					}
				});
				console.dir(that.newDogsObject);
				that.gameState = 'saveAndNotify';
			}

		};
	}());

	$looper.initThis();
	$looper.main();
	console.dir($looper);
}
)();
