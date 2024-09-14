const cheerio = require('cheerio')
const axios = require('axios')
const https = require('https')

// 測試時忽略證書驗證
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '短劇天堂',
    site: 'https://duanjutt.tv',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return config
}

async function getTabs() {
    let list = []
    let ignore = ['首页', '明星']
    function isIgnoreClassName(className) {
        return ignore.some((element) => className.includes(element))
    }

    const { data } = await axios.get(appConfig.site, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)

    let allClass = $('.dropdown-box ul li a')
    allClass.each((i, e) => {
        const name = $(e).text()
        const href = $(e).attr('href')
        const isIgnore = isIgnoreClassName(name)
        if (isIgnore) return

        list.push({
            name,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return list
}

async function getCards(ext) {
    let cards = []
    let { page = 1, url } = ext

    if (page > 1) {
        url = url.replace('.html', `-${page}.html`)
    }

    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $('.myui-vodlist li').each((_, element) => {
        const href = $(element).find('a.myui-vodlist__thumb').attr('href')
        const title = $(element).find('a.myui-vodlist__thumb').attr('title')
        const cover = $(element).find('a.myui-vodlist__thumb').attr('data-original')
        const subTitle = $(element).find('.pic-text').text().trim()
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return {
        list: cards,
    }
}

async function getTracks(ext) {
    let tracks = []
    let url = ext.url

    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $('#playlist1 a').each((_, e) => {
        const name = $(e).text().trim()
        const href = $(e).attr('href')
        tracks.push({
            name: name,
            pan: '',
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return {
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    }
}

async function getPlayinfo(ext) {
    const url = ext.url

    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    let player = data.match(/r player.*=\{(.*)\}/)[1]
    let config = JSON.parse(`{${player}}`)

    if (config.encrypt === 0) {
        let purl = config.url
        try {
            // 跳過證書驗證
            const httpsAgent = new https.Agent({ rejectUnauthorized: false })
            const response = await axios.get(purl, {
                maxRedirects: 0, // 禁止重定向
                httpsAgent: httpsAgent,
                headers: {
                    'User-Agent': UA,
                    Referer: appConfig.site,
                },
            })
        } catch (error) {
            if (error.response && error.response.status >= 300 && error.response.status < 400) {
                const location = error.response.headers.location
                return { urls: [location] }
            }
        }
    }

    return { urls: [] }
}

async function search(ext) {
    // 開啟驗證碼了，有空再寫
    // pic https://duanjutt.tv/index.php/verify/index.html?
    let cards = []

    let text = ext.text
    let page = ext.page || 1
    let url = `${appConfig.site}/?s=${text}`

    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $('.search_list li').each((_, element) => {
        const href = $(element).find('a').attr('href')
        const title = $(element).find('img.thumb').attr('alt')
        const cover = $(element).find('img.thumb').attr('data-original')
        const subTitle = $(element).find('.jidi').text()
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return {
        list: cards,
    }
}

module.exports = { getConfig, getCards, getTracks, getPlayinfo, search }