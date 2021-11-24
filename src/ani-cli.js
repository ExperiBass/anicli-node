#!/usr/bin/env node
const axios = require('axios')
const {exec} = require('child_process')
const chalk = require('chalk')
const inquirer = require('inquirer')
const binName = Object.keys(require('../package.json').bin)[0]

const PLAYERS = [
    'mpv',
    'vlc'
] // players that support URLs
const OPTIONS = {
    '-h': {
        'description': 'show this help text',
        'call': helpText
    },
    '-d': {
        'description': 'download episode',
        'call': download
    },
    '-c': {
        'description': 'continue where you left off',
        'call': cont
    },
    '-D': {
        'description': 'delete history',
        'call': deleteHistory
    },
    '-q': {
        'description': 'set video quality',
        'call': setQuality
    }
}

const ARGS = process.argv.slice(2)
const BASE_URL = 'https://gogoanime.cm'

function colorize(color) {
    return chalk[color]
}
function helpText() {
    console.log(`USAGE: ${binName} <query>`)
    for (let key of Object.keys(OPTIONS)) {
        const flag = OPTIONS[key]
        console.log(`   ${key}  ${flag.description}`)
    }
}

function die() {
    process.exit(1)
}
function cont() {}
function deleteHistory() {}
function setQuality() {}

const TITLE_PATTERN = /<p class=["']name["']><a href=["']\/category\/(.+)["'] title=["'](.+)["']>/ig // matches name and ID of anime
const EP_PATTERN = /.+ep_end.+>(?:\d+-)?(\d+)<\/a>/ig // Matches the episode count
const REFERER_PATTERN = /<a href=["']#["'] rel=["'](?:1|100)["'] data-video=["'](.+)["'] >/ig // Matches the video player url
                                                                    // link to gogoplay is missing the 'https:' part
const VIDEO_PATTERN = /sources:\[{file: ["'](.+\.m3u8)["']/ig


async function searchAnime(name) {
    let res;
    try {
        res = await axios.get(`${BASE_URL}//search.html?keyword=${name}`)
    } catch(e) {
        throw e
    }
    const matches = res.data.matchAll(TITLE_PATTERN)
    let anime = []

    for (const match of matches) {
        anime.push(match[2])
    }
    return anime
}

async function getEpisodeCount(animeID) {
    let res;
    try {
        res = await axios.get(`${BASE_URL}/category/${animeID}`)
    } catch(e) {
        throw e.responseCode
    }
    const matches = [...res.data.matchAll(EP_PATTERN)]
    const episodes = matches[matches.length - 1][1]
    return episodes
}

async function getVideoLink(animeID, episodeNumber) {
    let res;
    let refererRes;
    try {
        res = await axios.get(`${BASE_URL}/${animeID}-episode-${episodeNumber}`)
    } catch(e) {
        throw e
    }
    const refererMatches = [...res.data.matchAll(REFERER_PATTERN)]
    const referring_video_url = `https:${refererMatches[0][1]}`
    try {
        refererRes = await axios.get(referring_video_url)
    } catch(e) {
        throw e
    }
    const videoMatches = [...refererRes.data.matchAll(VIDEO_PATTERN)]
    const video_url = videoMatches[0][1]
    return {
        referer: referring_video_url,
        video: video_url
    }
}

async function download() {}
function play(referer, video, name, episodeNumber) {
    console.log(`${colorize('blueBright')('You\'ve chosen')} ${colorize('green')(name)} ${colorize('blueBright')('episode')} ${colorize('yellow')(episodeNumber)}!`)
    console.log(colorize('yellow')('Starting video player... (this may take a while)'))
    exec(`mpv --http-header-fields='Referer: ${referer}' --ytdl-raw-options=no-check-certificate= ${video}`)
}

async function MAIN(ARGS) {
    let argQueue = []
    let name;
    // check for options
    for (let i = 0; i < ARGS.length; i++) {
        const arg = ARGS[i]
        // find the options and add to queue
        if (OPTIONS[arg]) {
            argQueue.push({call: OPTIONS[arg].call, index: i})
            ARGS.splice(i, 1)
        }
        // check if a anime name was passed
        if (ARGS.length > 0) {
            name = ARGS.join('-')
        }
    }
    // run through the queue
    for (let option of argQueue) {
        option.call()
    }
    // now process
    if (!name) {
        const search = await inquirer.prompt({
            type: 'input',
            name: 'search',
            message: 'Search Anime:'
        })
        name = search['search']
    }
    const anime = await searchAnime(name)
    let formattedAnimeName
    const chosenAnime = await inquirer.prompt({
        type: 'list',
        name: 'animePicker',
        message: 'Choose anime:',
        choices: anime,
        loop: true,
        filter: (input) => {
            formattedAnimeName = input
            return input.toLowerCase().replace(/ /g, '-').replace(/[~`!@#$%^&*()+={}[\]?.,<>:;"']+/g, '')
        }
    })
    const episodes = await getEpisodeCount(chosenAnime['animePicker'])
    const chosenEpisode = await inquirer.prompt({
        type: 'number',
        name: 'episodePicker',
        message: `Choose episode (1-${episodes})`,
        choices: episodes,
        default: 1
    })
    const videoData = await getVideoLink(chosenAnime['animePicker'], chosenEpisode['episodePicker'])
    play(videoData.referer, videoData.video, chosenAnime['animePicker'], chosenEpisode['episodePicker'])
}

MAIN(ARGS)