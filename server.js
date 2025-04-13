require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const pool = require('./database')
const cookieparser = require('cookie-parser')

const app = express()
const port = 3000

app.use(cors())
app.use(cookieparser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))
app.use('/static', express.static(path.join(__dirname, '../frontend/static')))

const key = process.env.SESSION_KEY

// PAGES //

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/index.html'))
})

app.get('/listings', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/listings.html'))
})

app.get('/resources', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/resources.html'))
})

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/login.html'))
})

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/register.html'))
})

// JOBS //

app.get('/jobs', async (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/jobs.html'))
})

app.get('/jobs/:id', async (req, res) => {
    const id = req.params.id
    if (isNaN(id)) return res.status(400).send('Invalid ID')
    console.log(`Viewing portfolio ID: ${id}`)

    try {
        const listingResult = await pool.query('SELECT * FROM listings WHERE id = $1', [id])

        if (listingResult.rows.length === 0) {
            return res.status(404).send('Listing does not exist')
        }

        const listing = listingResult.rows[0]
        console.log(listing.employer, parseInt(req.cookies.id))
        if (!(listing.employer === parseInt(req.cookies.id))) {
            return res.status(404).send('You don\'t own this listing')
        } else {
            res.sendFile(path.join(__dirname, '../backend/templates/applications.html'))
        }
    } catch (err) {
        console.error('Portfolio error:', err)
        res.status(500).send('Server error')
    }
})

app.get('/applications/:listing/:id', async (req, res) => {
    const listingid = req.params.listing
    const id = req.params.id
    const viewer = req.cookies.id
    try {
        const applicationResult = await pool.query(`SELECT * FROM applications WHERE applicant = $1 AND listing = $2`, [id, listingid])
        if (applicationResult.rows.length === 0) {
            return res.status(404).send('Application not found')
        }

        const application = applicationResult.rows[0]

        const listingResult = await pool.query(`SELECT * FROM listings WHERE id = $1`, [listingid])
        const listing = listingResult.rows[0]

        const employerResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [listing.employer])
        const employer = employerResult.rows[0]

        const portfolioResult = await pool.query(`SELECT * FROM portfolios WHERE owner = $1`, [listing.employer])
        const portfolio = portfolioResult.rows[0]

        const applicantResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [application.applicant])
        const applicant = applicantResult.rows[0]

        if (listingResult.rows.length === 0 || employerResult.rows.length === 0 || portfolioResult.rows.length === 0 || applicantResult.rows.length === 0) {
            return res.status(404).send('Application not found')
        }

        if (!(parseInt(viewer) === parseInt(application.applicant) || parseInt(viewer) === parseInt(listing.employer))) {
            console.log(viewer, application.applicant, listing.employer)
            return res.status(404).send('Application does not exist')
        }

        const response = await fetch(`https://api.zippopotam.us/us/${listing.location}`)
        const data = await response.json()
        const formattedCity = `${data.places[0]['place name']}, ${data.places[0]['state abbreviation']}`

        const applicationTemplate = path.join(__dirname, 'templates/application.html')
        fs.readFile(applicationTemplate, 'utf8', (err, atemplate) => {
            if (err) return res.status(500).send('Template read error')

            const rendered = atemplate
                .replace('ApplicationMessage', application.message + '<br><br>- ' + applicant.first + ` ` + applicant.last)
                .replace('SplashIcon', listing.icon)
                .replace('Icon', listing.icon)
                .replace('ListingName', listing.name)
                .replace('Location', formattedCity)
                .replace('Wages', listing.salary)
                .replace('Arrangements', listing.arrangements)
                .replace('Posted', timeAgo(listing.created))
                .replace('AboutBlurb', listing.description)
                .replace('SkillsBlurb', listing.skills)
                .replace('ResponsibilitiesBlurb', listing.responsibilities)
                .replace('BenefitsBlurb', listing.benefits)
                .replace('RequirementsBlurb', listing.requirements)
                .replace('EmployerAvatar', employer.icon)
                .replace('EmployerName', employer.first + ' ' + employer.last)
                .replace('EmployerBackground', portfolio.about || '')

            const tempFile = path.join(__dirname, `temp_${id}.html`)
            fs.writeFile(tempFile, rendered, () => res.sendFile(tempFile, () => fs.unlink(tempFile, () => {})))
        })
    } catch (err) {
        console.error('Application error:', err)
        res.status(500).send('Server error')
    }
})

// PORTFOLIO //

const portfolioTemplate = path.join(__dirname, 'templates/portfolio.html')
const portfolioCreateTemplate = path.join(__dirname, 'templates/portfoliocreate.html')

app.get('/portfolio/:id', async (req, res) => {
    const id = req.params.id
    console.log(`Viewing portfolio ID: ${id}`)

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id])
        const portfolioResult = await pool.query('SELECT * FROM portfolios WHERE owner = $1', [id])

        if (userResult.rows.length === 0) {
            return res.status(404).send('User or portfolio not found')
        }

        const user = userResult.rows[0]

        if (portfolioResult.rows.length === 0) {
            if (!(req.cookies.id === id)) {
                return res.status(404).send('User or portfolio not found')
            } else {
                console.log('RETURNING PORTFOLIO CREATE PAGE')
                fs.readFile(portfolioCreateTemplate, 'utf8', (err, pctemplate) => {
                    if (err) return res.status(500).send('Template read error')
                    const phone = `(${user.phone.toString().slice(0, 3)}) ${user.phone.toString().slice(3, 6)}-${user.phone.toString().slice(6, 10)}`

                    const rendered = pctemplate
                        .replace('SplashIcon', user.icon)
                        .replace('Avatar', user.icon)
                        .replace('Name/portfolio', user.first + ' ' + user.last)
                        .replace('Email/portfolio', user.email || `N/A`)
                        .replace('Phone/portfolio', phone || `N/A`)

                    const tempFile = path.join(__dirname, `temp_${id}.html`)
                    fs.writeFile(tempFile, rendered, () => res.sendFile(tempFile, () => fs.unlink(tempFile, () => {})))
                })
            }
        } else {
            portfoliodata = portfolioResult.rows[0]

            const phone = `(${user.phone.toString().slice(0, 3)}) ${user.phone.toString().slice(3, 6)}-${user.phone.toString().slice(6, 10)}`

            fs.readFile(portfolioTemplate, 'utf8', (err, template) => {
                if (err) return res.status(500).send('Template read error')

                const rendered = template
                    .replace('SplashIcon', user.icon)
                    .replace('Avatar', user.icon)
                    .replace('Name/portfolio', user.first + ` ` + user.last)
                    .replace('Email/portfolio', user.email || `N/A`)
                    .replace('Phone/portfolio', phone || `N/A`)
                    .replace('AboutBlurb', portfoliodata.about || `${user.first} has no achievements listed.`)
                    .replace('ExperienceBlurb', portfoliodata.experience || `${user.first} has no experience listed.`)
                    .replace('EducationBlurb', portfoliodata.education || `${user.first} has no education listed.`)
                    .replace('SkillsBlurb', portfoliodata.skills || `${user.first} has no skills listed.`)
                    .replace('AchievementsBlurb', portfoliodata.achievements || `${user.first} has no achievements listed.`)

                const tempFile = path.join(__dirname, `temp_${id}.html`)
                fs.writeFile(tempFile, rendered, () => res.sendFile(tempFile, () => fs.unlink(tempFile, () => {})))
            })
        }
    } catch (err) {
        console.error('Portfolio error:', err)
        res.status(500).send('Server error')
    }
})

// LISTINGS //

const listingTemplate = path.join(__dirname, 'templates/listing.html')

function timeAgo(unixTimestamp) {
    const seconds = Math.floor(Date.now() / 1000) - unixTimestamp;
  
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minute(s) ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour(s) ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} day(s) ago`;
    if (seconds < 2419200) return `${Math.floor(seconds / 604800)} week(s) ago`;
    return `${Math.floor(seconds / 2419200)} month(s) ago`;
  }
  

app.get('/listings/:id', async (req, res) => {
    const id = req.params.id
    if (isNaN(id)) return res.status(400).send('Invalid ID')

    try {
        const result = await pool.query('SELECT * FROM listings WHERE id = $1', [id])
        if (result.rows.length === 0 || !result.rows[0].approved) {
            return res.status(404).send('Listing not found')
        }

        const listing = result.rows[0]
        const response = await fetch(`https://api.zippopotam.us/us/${listing.location}`)
        const data = await response.json()
        const formattedCity = `${data.places[0]['place name']}, ${data.places[0]['state abbreviation']}`

        const employerresult = await pool.query('SELECT * FROM users WHERE id = $1', [listing.employer])
        const employer = employerresult.rows[0]

        const portfolioresult = await pool.query('SELECT * FROM portfolios WHERE owner = $1', [listing.employer])
        let portfolio

        if (portfolioresult.rows.length === 0) {
            portfolio = { about: undefined }
        } else {
            portfolio = portfolioresult.rows[0]
        }

        fs.readFile(listingTemplate, 'utf8', (err, template) => {
            if (err) return res.status(500).send('Template read error')

            const rendered = template
                .replace('SplashIcon', listing.icon)
                .replace('Icon', listing.icon)
                .replace('ListingName', listing.name)
                .replace('Location', formattedCity)
                .replace('Wages', listing.salary)
                .replace('Arrangements', listing.arrangements)
                .replace('Posted', timeAgo(listing.created))
                .replace('AboutBlurb', listing.description)
                .replace('SkillsBlurb', listing.skills)
                .replace('ResponsibilitiesBlurb', listing.responsibilities)
                .replace('BenefitsBlurb', listing.benefits)
                .replace('RequirementsBlurb', listing.requirements)
                .replace('EmployerAvatar', employer.icon)
                .replace('EmployerName', employer.first + ' ' + employer.last)
                .replace('EmployerBackground', portfolio.about || '')

            const tempFile = path.join(__dirname, `temp_${id}.html`)
            fs.writeFile(tempFile, rendered, () => res.sendFile(tempFile, () => fs.unlink(tempFile, () => {})))
        })
    } catch (err) {
        console.error('Listing error:', err)
        res.status(500).send('Server error')
    }
})

// RESOURCES //

const articleTemplate = path.join(__dirname, 'templates/article.html')

app.get('/resources/:path', async (req, res) => {
    const articlePath = req.params.path
    try {
        const result = await pool.query('SELECT * FROM articles WHERE path = $1', [articlePath])
        if (result.rows.length === 0) return res.status(404).send('Article not found')

        const article = result.rows[0]

        const userresult = await pool.query('SELECT * FROM users WHERE id = $1', [article.author])
        const user = userresult.rows[0]
        console.log(article)

        const paragraphs = article.text.split(/<br\s*\/?>/i).map(line => `<p>${line.trim()}</p>`).join('')

        fs.readFile(articleTemplate, 'utf8', (err, template) => {
            if (err) return res.status(500).send('Template read error')

            const rendered = template
                .replace('Title', article.name)
                .replace('Author', 'By ' + user.first + ' ' + user.last)
                .replace('Text', paragraphs)
            const tempFile = path.join(__dirname, `temp_${articlePath}.html`)
            fs.writeFile(tempFile, rendered, () => res.sendFile(tempFile, () => fs.unlink(tempFile, () => {})))
        })
    } catch (err) {
        console.error('Article error:', err)
        res.status(500).send('Server error')
    }
})

// CONSOLE //

app.get('/console', (req, res) => {
    const admin = parseInt(req.cookies.type)
    console.log(admin)
    if (!(admin === 3)) return res.redirect('/')
    res.sendFile(path.join(__dirname, '../backend/templates/master/console.html'))
})

app.get('/console/:sect', (req, res) => {
    const sect = req.params.sect
    const admin = parseInt(req.cookies.type)
    if (!(admin === 3)) return res.redirect('/')

    const validSections = ['listings', 'resources', 'reports', 'tickets', 'accounts']
    if (validSections.includes(sect)) {
        return res.sendFile(path.join(__dirname, `../backend/templates/master/console/${sect}.html`))
    }
    return res.redirect('/console')
})

const cltemplate = path.join(__dirname, 'templates/master/clisting.html')

app.get('/console/listings/:id', async (req, res) => {
    const id = req.params.id
    console.log(`Counselor tried view listing with ID: ${id}`)

    if (isNaN(id)) {
        return res.status(400).send('Invalid ID');
    }

    try {
        const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [id])
        if (listing.rows.length === 0) {
            return res.status(404).send('Listing does not exist')
        }
        const listinginfo = listing.rows[0]

        if (listinginfo.approved == true) {
            return res.status(404).send('Listing already approved')
        }

        const response = await fetch(`https://api.zippopotam.us/us/${listinginfo.location}`)

        if(!response.ok) {
            console.error('Error fetching place:', response)
            return res.status(500).send('Server error')
        }

        const data = await response.json()

        const city = data.places[0]['place name']
        const state = data.places[0]['state abbreviation']
        const formattedcity = `${city}, ${state}`

        fs.readFile(cltemplate, 'utf8', (err, cltemplate) => {
            if (err) {
                console.error('Error reading template:', err)
                return res.status(500).send('Server error')
            }

            let renderedPortfolio = cltemplate
                .replace('SplashIcon', listinginfo.icon)
                .replace('Icon', listinginfo.icon)
                .replace('Name', listinginfo.name)
                .replace('Location', formattedcity)

            const tempFile = path.join(__dirname, `temp_${id}.html`)
            fs.writeFile(tempFile, renderedPortfolio, (err) => {
                if (err) {
                    console.error('Error creating temp file:', err)
                    return res.status(500).send('Server error')
                }

                res.sendFile(tempFile, (err) => {
                    fs.unlink(tempFile, (err) => {
                        if (err) console.error('Error deleting temp file:', err)
                    })
                })
            })
        })
    } catch (err) {
        console.error('Database error:', err)
        res.status(500).send('Server error')
    }
})

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../backend/master/panel.html'))
})

// ROUTES //

app.post('/searchapplications', async (req, res) => {
    const { id } = req.body
    console.log()
    try {
        const result = await pool.query(`SELECT * FROM applications WHERE listing = $1`, [parseInt(id)])

        const appliantids = result.rows.map(row => row.applicant)

        const userresult = await pool.query(`SELECT * FROM users WHERE id = ANY($1)`, [appliantids])

        const applications = await Promise.all(userresult.rows.map(async (a) => ({
            ...a
        })))

        res.status(200).json({ applications: applications })
    } catch (err) {
        console.error('Jobs error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.post('/searchjobs', async (req, res) => {
    const account = req.cookies.id
    const type = parseInt(req.cookies.type)
    console.log(type)
    try {
        if (type === 2 || type === 3) {
            console.log('EMPLOYER OR COUNSELOR')
            const result = await pool.query(`SELECT * FROM listings WHERE employer = $1`, [account])

            const listings = await Promise.all(result.rows.map(async (l) => ({
                ...l,
                location: await formatLocation(l.location)
            })))

            res.status(200).json({ listings })
        } else if (type === 1) {
            const result = await pool.query(`SELECT * FROM applications WHERE applicant = $1`, [account])

            console.log(result.rows[0])

            const listingids = result.rows.map(row => row.listing)

            if (listingids.length === 0) {
                return res.status(200).json({ listings: [] });
            }

            const listingresult = await pool.query(`SELECT * FROM listings WHERE id = ANY($1)`, [listingids])

            const listings = await Promise.all(listingresult.rows.map(async (l) => ({
                ...l,
                location: await formatLocation(l.location)
            })))

            console.log(listings)

            res.status(200).json({ listings });
        } else {
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Jobs error:', err)
        res.status(500).json({ error: 'Server error' })
    }
}) 

app.post('/login', async (req, res) => {
    const { email, password } = req.body
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
        if (result.rows.length === 0 || !(await bcrypt.compare(password, result.rows[0].password))) {
            return res.status(400).json({ message: 'Invalid credentials.' })
        }

        const user = result.rows[0]

        const token = jwt.sign(
            { id: user.id, email: user.email, type: user.type },
            key,
            { expiresIn: '1h' }
        );
        const userinfo = { id: user.id, email: user.email, first: user.first, last: user.last, avatar: user.icon, type: user.type }

        res.status(200).json({ token, userinfo })
    } catch (err) {
        console.error('Login error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/newapplication', async (req, res) => {
    const { applicant, listing, message } = req.body
    try {
        const result = await pool.query('INSERT INTO applications (applicant, listing, message) VALUES ($1, $2, $3)', [applicant, listing, message])
        res.status(200).json({ message: 'OK' })
    } catch (err) {
        console.error('Login error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

function unixConverter(datestr) {
    const date = new Date(datestr)

    if (isNaN(date.getTime())) {
        throw new Error('[CONSOLE] ERROR (unixConverter): Invalid date format. Use YYYY/MM/DD')
    }

    return Math.floor(date.getTime() / 1000)
}

app.post('/register', async (req, res) => {
    const { email, password, first, middle, last, phone, dob, icon } = req.body
    let type = req.body.type
    try {
        const hashed = await bcrypt.hash(password, 10)
        const unixdob = unixConverter(dob)
        phone.replace(/\D/g, '')
        const result = await pool.query('INSERT INTO users (email, password, first, middle, last, phone, dob, icon, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [email, hashed, first, middle, last, phone, unixdob, icon, type])
        console.log(result)
        const token = jwt.sign({ email, type, result }, key, { expiresIn: '1h' })
        const userinfo = { id: result.rows[0].id, email: email, first: first, last: last, avatar: icon, type: type }
        res.status(201).json({ token, userinfo })
    } catch (error) {
        const ip = req.ip
        console.log(`[${ip}] ERROR (/register): ${error}`)
        res.status(500).json({ error: `Server error` })
    }
})

app.post('/createticket', async (req, res) => {
    const { ticketee, email, subject, message, name, date, others, type } = req.body

    try {
        const result = await pool.query(`INSERT INTO tickets (ticketee, email, subject, message, name, type, date, others) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
             [ticketee, email, subject, message, name, type, date, others])
        res.status(200).json({ id: result.id })
    } catch (error) {
        const ip = req.ip
        console.log(`[${ip}] ERROR (/register): ${error}`)
        res.status(500).json({ error: `Server error` })
    }
})

app.post('/resolveticket', async (req, res) => {
    const { id } = body.req
})

app.post('/postarticle', async (req, res) => {
    const { id, name, text, path } = req.body
    try {
        const query = await pool.query(`INSERT INTO articles (author, name, text, path) VALUES ($1, $2, $3, $4)`, [id, name, text, path])
        res.status(201).json({ path: path })
    } catch (err) {
        console.error('Posting article error:', err)
        res.status(500).json({ error: 'Server error' })
    } 
})

app.post('/post', async (req, res) => {
    const { name, icon, location, salary, description, arrangements, requirements, skills, responsibilities, benefits, employer } = req.body
    try {
        const query = await pool.query(
            `INSERT INTO listings (name, employer, icon, location, salary, arrangements, description, requirements, skills, responsibilities, benefits, created)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [name, employer, icon, location, salary, arrangements, description, requirements, skills, responsibilities, benefits, Math.floor(Date.now() / 1000)]
        )
        res.status(201).json({ id: query.rows[0].id })
    } catch (err) {
        console.error('Post error:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.post('/approve', async (req, res) => {
    try {
        await pool.query('UPDATE listings SET approved = true WHERE id = $1', [req.body.id])
        res.sendStatus(200).json({ message: 'approved' })
    } catch (err) {
        console.error('Approval error:', err)
        res.status(500).send('Server error')
    }
})

app.post('/delete', async (req, res) => {
    try {
        await pool.query('DELETE FROM listings WHERE id = $1', [req.body.id])
        res.sendStatus(200).json({ message: 'deleted' })
    } catch (err) {
        console.error('Delete error:', err)
        res.status(500).send('Server error')
    }
})

const formatLocation = async (zip) => {
    try {
        const response = await fetch(`https://api.zippopotam.us/us/${zip}`)
        if (!response.ok) return 'N/A'
        const data = await response.json()
        return `${data.places[0]['place name']}, ${data.places[0]['state abbreviation']}`
    } catch {
        return 'N/A'
    }
}

app.post('/search', async (req, res) => {
    const tags = req.body.tags || []

    try {
        const baseQuery = tags.length === 0
            ? 'SELECT * FROM listings WHERE approved = true'
            : 'SELECT * FROM listings WHERE tags @> $1::TEXT[]'
        const queryParams = tags.length === 0 ? [] : [tags]

        const result = await pool.query(baseQuery, queryParams)
        const listings = await Promise.all(result.rows.map(async (l) => ({
            ...l,
            location: await formatLocation(l.location)
        })))

        res.status(200).json({ listings })
    } catch (err) {
        console.error('Search error:', err)
        res.status(500).send('Server error')
    }
})

app.post('/searchtickets', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tickets')
        const tickets = await Promise.all(result.rows.map(async (t) => ({
            ...t
        })))

        res.status(200).json({ tickets })
    } catch (err) {
        console.error('Search error:', err)
        res.status(500).send('Server error')
    }
})

app.post('/searchraw', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM listings WHERE approved = false')
        const listings = await Promise.all(result.rows.map(async (l) => ({
            ...l,
            location: await formatLocation(l.location)
        })))

        res.status(200).json({ listings })
    } catch (err) {
        console.error('Search raw error:', err)
        res.status(500).send('Server error')
    }
})

app.post('/searchportfolio', async (req, res) => {
    const id = req.body.id
    try {
        const result = await pool.query(`SELECT * FROM listings WHERE id = ${id}`)
        if (result.rows.length === 0) {
            res.status(404).send('Portfolio not found')
        } else {
            res.status(200).send('Portfolio found')
        }
    } catch (err) {
        console.error('Search raw error:', err)
        res.status(500).send('Server error')
    }
})

app.post('/createportfolio', async (req, res) => {
    const { id, about, experience, education, skills, achievements } = req.body
    console.log(id, about, experience, education, skills, achievements)
    try {
        const result = await pool.query(`INSERT INTO portfolios (owner, about, experience, education, skills, achievements) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (owner) DO UPDATE SET owner = $1, about = $2, experience = $3, education = $4, skills = $5, achievements = $6`, [id, about, experience, education, skills, achievements])
        console.log(result)
    } catch (err) {
        console.error('Portfolio create/update error:', err)
        res.status(500).send('Server error')
    }
})

app.listen(port, () => {
    console.log(`[CONSOLE] Server running on http://localhost:${port}`)
})