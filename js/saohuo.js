const cheerio = require('cheerio')
const axios = require('axios')
const CryptoJS = require('crypto-js')
const fetch = require('node-fetch')

// 測試時忽略證書驗證
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    Cookie: 'PHPSESSID=oe6prf46idn97gmd7j5gffka39',
}
const listUrl = 'https://saohuo.tv/list/@id@-@page@.html'

let appConfig = {
    ver: 1,
    title: '燒火電影',
    site: 'https://saohuo.tv',
    tabs: [
        {
            name: '電影',
            ext: {
                id: 1,
                url: listUrl,
            },
        },
        {
            name: '電視劇',
            ext: {
                id: 2,
                url: listUrl,
            },
        },
        {
            name: '動漫',
            ext: {
                id: 4,
                url: listUrl,
            },
        },
    ],
}

function getConfig() {
    return appConfig
}

async function getCards(ext) {
    let cards = []
    let { id, page = 1, url } = ext

    url = url.replace('@id@', id).replace('@page@', page)

    // 发送请求
    const { data } = await axios.get(url, {
        headers: headers,
    })

    // 加载 HTML
    const $ = cheerio.load(data)

    // 解析数据，例如提取标题
    $('ul.v_list div.v_img').each((_, element) => {
        const href = $(element).find('a').attr('href')
        const title = $(element).find('a').attr('title')
        const cover = $(element).find('img').attr('data-original')
        const subTitle = $(element).find('.v_note').text()
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
    let list = []
    let url = ext.url

    // 发送请求
    const { data } = await axios.get(url, {
        headers: headers,
    })

    // 加载 HTML
    const $ = cheerio.load(data)

    let play_from = []
    $('ul.from_list li').each((_, e) => {
        play_from.push($(e).text().trim())
    })

    // 單集名稱重複會導致直接播放緩存的url，暫時加上劇名等修
    let show = $('.v_info_box .v_title').text()
    $('#play_link li').each((i, e) => {
        const from = play_from[i]
        const eps = $(e).find('a')
        let temp = []
        eps.each((_, e) => {
            const name = $(e).text()
            const href = $(e).attr('href')
            temp.push({
                name: `${show}-${name}`,
                pan: '',
                ext: {
                    url: `${appConfig.site}${href}`,
                },
            })
        })
        temp.sort((a, b) => {
            return a.name.split('-')[1] - b.name.split('-')[1]
        })
        list.push({
            title: from,
            tracks: temp,
        })
    })

    return {
        list: list,
    }
}

async function getPlayinfo(ext) {
    const url = ext.url

    // 发送请求
    const { data } = await axios.get(url, {
        headers: headers,
    })

    if (data) {
        const $ = cheerio.load(data)
        const iframeUrl = $('iframe').attr('src')
        const apiUrl = iframeUrl.match(/^(https?:\/\/[^\/]+)/)[1] + '/api.php'

        const resp = await axios.get(iframeUrl, {
            headers: headers,
        })
        if (resp.data) {
            const $ = cheerio.load(resp.data)
            const script = $('body script').text()
            const url = script.match(/var url = "(.*)"/)[1]
            const t = script.match(/var t = "(.*)"/)[1]
            const key = script.match(/var key = "(.*)"/)[1]
            const params = new URLSearchParams({
                url: url,
                t: t,
                key: key,
                act: 0,
                play: 1,
            })

            // 用axios發post請求會閃退
            // const presp = await axios.post(
            //     apiUrl,
            //     {},
            //     {
            //         headers: {
            //             'Content-Type': 'application/x-www-form-urlencoded',
            //             'User-Agent': headers['User-Agent'],
            //             Referer: iframeUrl,
            //         },
            //     }
            // )
            // console.log(presp.data)
            const presp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': headers['User-Agent'],
                    Referer: iframeUrl,
                },
                body: params.toString(),
            })

            const result = await presp.json()

            let playUrl = /http/.test(result.url) ? result.url : iframeUrl.match(/^(https?:\/\/[^\/]+)/)[1] + result.url
            return { urls: [playUrl] }
        }
    }
}

async function search(ext) {
    let cards = []
    const ocrApi = 'https://api.nn.ci/ocr/b64/json'

    let text = ext.text // 搜索文本
    // let page = ext.page || 1
    let validate = appConfig.site + '/include/vdimgck.php'
    let url = appConfig.site + '/search.php?scheckAC=check&page=&searchtype=&order=&tid=&area=&year=&letter=&yuyan=&state=&money=&ver=&jq='

    let img = await axios.get(validate, {
        headers: headers,
        responseType: 'arraybuffer',
    })

    function arrayBufferToBase64(arrayBuffer) {
        let uint8Array = new Uint8Array(arrayBuffer)
        let wordArray = CryptoJS.lib.WordArray.create(uint8Array)
        let base64String = CryptoJS.enc.Base64.stringify(wordArray)

        return base64String
    }

    let b64 = arrayBufferToBase64(img.data)

    let ocrRes = await fetch(ocrApi, {
        method: 'POST',
        headers: headers,
        body: b64,
    })
    let vd = (await ocrRes.json()).result

    let searchRes = await fetch(url, {
        method: 'POST',
        headers: {
            'user-agent': headers['User-Agent'],
            cookie: headers.Cookie,
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: `validate=${vd.toUpperCase()}&searchword=${encodeURIComponent(text)}`,
    })
    let html = await searchRes.text()

    const $ = cheerio.load(html)

    $('ul.v_list div.v_img').each((_, element) => {
        const href = $(element).find('a').attr('href')
        const title = $(element).find('a').attr('title')
        const cover = $(element).find('img').attr('data-original')
        const subTitle = $(element).find('.v_note').text()
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