const puppeteer = require('puppeteer')
const db = require('@cyclic.sh/dynamodb')

const urlList = [
    'https://www.century21.pt/comprar/moradia/alcobaca/?numberOfElements=12&map=225000&ptd=Moradia%7CQuinta%20e%20Herdade&ma=100&q=Portugal%2C%20Leiria%2C%20Alcoba%C3%A7a&ord=date-desc',
    'https://www.century21.pt/comprar/moradia/batalha/?numberOfElements=12&map=225000&ptd=Moradia%7CQuinta%20e%20Herdade&ma=100&q=Portugal%2C%20Leiria%2C%20Batalha&ord=date-desc',
    'https://www.century21.pt/comprar/moradia/leiria/?numberOfElements=12&map=225000&ptd=Moradia%7CQuinta%20e%20Herdade&ma=100&q=Portugal%2C%20Leiria%2C%20Leiria&ord=date-desc',
    'https://www.century21.pt/comprar/moradia/marinha-grande/?numberOfElements=12&map=225000&ptd=Moradia%7CQuinta%20e%20Herdade&ma=100&q=Portugal%2C%20Leiria%2C%20Marinha%20Grande&ord=date-desc',
    'https://www.century21.pt/comprar/moradia/porto-de-mos/?numberOfElements=12&map=225000&ptd=Moradia%7CQuinta%20e%20Herdade&ma=100&q=Portugal%2C%20Leiria%2C%20Porto%20de%20M%C3%B3s&ord=date-desc',
]

// TODO: Optimize to get only new ones (also need to delete recently unavailable)
const getUrlLinks = async () => {
    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch({ headless: 'new' })
    const page = await browser.newPage()

    const results = []

    // Navigate the page to a URL
    for (let url of urlList) {
        await page.goto(url)
        await page.waitForSelector('.c21card__photo')

        const link_list = await page.$$eval('.c21card__photo', (links) => {
            return links.map((link) => link.href)
        })

        results.push(...link_list)
    }

    await browser.close()
    return results
}

const getC21 = async (req, res) => {
    const urlLinks = await getUrlLinks()
    const browser = await puppeteer.launch({ headless: 'new' })
    const page = await browser.newPage()

    for (let url of urlLinks) {
        await page.goto(url)
        await page.waitForSelector('.contentc21__slideshow img')

        const titleSelector = await page.waitForSelector('.property-title')
        const title = await titleSelector?.evaluate((el) => el.textContent)

        await page.waitForSelector('.contentc21-property__content-body')
        await page.waitForSelector('.collapsible-content')

        const [detailsButton] = await page.$x(
            "//button[contains(., 'Detalhes')]"
        )

        if (detailsButton) {
            const detailsSection = await page.evaluateHandle(
                (el) => el.nextElementSibling,
                detailsButton
            )

            const detailsList = await detailsSection
                .evaluate(async (el) => el.innerText)
                .split('\n')
                .map((d) => d.split(':'))

            const getDetail = (selector) => {
                const cleanDetail = detailsList.find((e) => e[0] === selector)
                if (cleanDetail) {
                    return cleanDetail[1]
                }
                return ''
            }

            const details = {
                price: getDetail('Preço').replace(/\D/g, ''),
                title,
                condition: getDetail('Estado'),
                areaUseful: getDetail('Área útil')
                    ?.replace(/m2/g, '')
                    ?.replace(/ /g, ''),
                areaBrute: getDetail('Área bruta')
                    ?.replace(/m2/g, '')
                    ?.replace(/ /g, ''),
                areaLand: getDetail('Área do Terreno')
                    ?.replace(/m2/g, '')
                    ?.replace(/ /g, ''),
                rooms: getDetail('Quartos'),
                wcs: getDetail('Casas de banho'),
                builtYear: getDetail('Ano de Construção'),
                parking: getDetail('Estacionamento'),
                energeticDegree: getDetail('Certificado energético'),
                reference: getDetail('Referência')?.replace(/ /g, ''),
                active: true,
            }

            let houses = db.collection('houses')
            let houseExist = await houses.get(details.reference)

            if (!houseExist) {
                // create an item in collection with key "leo"
                await houses.set(details.reference, details)
            }
        } else {
            console.log('NO DETAILS!')
        }
    }
    await browser.close()

    const houses = await db.collection('houses').list()
    console.log(JSON.stringify(houses, null, 2))
    res.json(houses).end()
}

module.exports = { getC21 }
