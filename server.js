const bcrypt = require('bcrypt')
const cors = require('cors')
const pool = require('./database')
const express = require('express')
const fs = require('fs')
const path = require('path')
const app = express()
const port = 3000
require('dotenv').config();

app.use(cors())
app.use(express.json())
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

app.use('/static', express.static(path.join(__dirname, '../frontend/static')))

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
    res.sendFile(path.join(__dirname, '../frontend/pages/temp-login.html'))
})

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/register.html'))
})

// PORTFOLIO //

const template = path.join(__dirname, 'templates/portfolio.html')

app.get('/portfolio/:id', async (req, res) => {
    const id = req.params.id
    console.log(`Someone tried view portfolio with ID: ${id}`)

    try {
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [id])
        if (user.rows.length === 0) {
            return res.status(404).send('User does not exist')
        }
        const userinfo = user.rows[0]
        console.log(userinfo)

        const result = await pool.query('SELECT * FROM portfolios WHERE id = $1', [id])
        if (result.rows.length === 0) {
            return res.status(404).send('Portfolio does not exist')
        }
        const data = result.rows[0]
        console.log(data)

        fs.readFile(template, 'utf8', (err, template) => {
            if (err) {
                console.error('Error reading template:', err)
                return res.status(500).send('Server error')
            }

            let acctype = 'N/A'
            if (userinfo.type === 1) {
                acctype = 'Student'
            } else if (userinfo.type === 2) {
                acctype = 'Employer'
            } else if (userinfo.type === 3) {
                acctype = 'Counselor'
            }
            console.log(acctype)

            phone = `(${userinfo.phone.toString().slice(0, 3)}) ${userinfo.phone.toString().slice(3, 6)}-${userinfo.phone.toString().slice(6, 10)}`

            let renderedPortfolio = template
                .replace('{{avatar}}', userinfo.avatar)
                .replace('{{name}}', `${userinfo.first} ${userinfo.last}`)
                .replace('{{type}}', acctype)
                .replace('{{phone}}', phone)
                .replace('{{pronouns}}', data.pronouns)

            const tempFile = path.join(__dirname, `temp_${id}.html`)
            fs.writeFile(tempFile, renderedPortfolio, (err) => {
                if (err) {
                    console.error("Error creating temp file:", err)
                    return res.status(500).send('Server error')
                }

                res.sendFile(tempFile, () => {
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

// LISTING //

const ltemplate = path.join(__dirname, 'templates/listing.html')

app.get('/listings/:id', async (req, res) => {
    const id = req.params.id
    console.log(`Someone tried view listing with ID: ${id}`)

    if (isNaN(id)) {
        return res.status(400).send('Invalid ID');
    }

    try {
        const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [id])
        if (listing.rows.length === 0) {
            return res.status(404).send('Listing does not exist')
        }
        const listinginfo = listing.rows[0]
        console.log(listinginfo)

        if (listinginfo.approved == false) {
            return res.status(404).send('Listing does not exist')
        }

        console.log(listinginfo.location)
        const response = await fetch(`https://api.zippopotam.us/us/${listinginfo.location}`)

        if(!response.ok) {
            console.error('Error fetching place:', response)
            return res.status(500).send('Server error')
        }

        const data = await response.json()
        console.log(data)

        const city = data.places[0]['place name']
        const state = data.places[0]['state abbreviation']
        const formattedcity = `${city}, ${state}`

        fs.readFile(ltemplate, 'utf8', (err, ltemplate) => {
            if (err) {
                console.error('Error reading template:', err)
                return res.status(500).send('Server error')
            }

            let renderedPortfolio = ltemplate
                .replace('SplashIcon', listinginfo.icon)
                .replace('Icon', listinginfo.icon)
                .replace('Name', listinginfo.name)
                .replace('Location', formattedcity)
                .replace('AboutBlurb', listing.description)

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

// RESOURCES //

const rtemplate = path.join(__dirname, 'templates/article.html')

app.get('/resources/:path', async (req, res) => {
    const path = req.params.path
    console.log(`Someone tried view resource with path: ${path}`)

    try {
        const article = await pool.query('SELECT * FROM resources WHERE path = $1', [path])
        if (article.rows.length === 0) {
            return res.status(404).send('Article does not exist')
        }
        const articleinfo = article.rows[0]
        console.log(articleinfo)

        fs.readFile(rtemplate, 'utf8', (err, template) => {
            if (err) {
                console.error('Error reading template:', err)
                return res.status(500).send('Server error')
            }

            let renderedArticle = template
                .replace('{{title}}', articleinfo)
            
                const tempFile = path.join(__dirname, `temp_${path}.html`)
                fs.writeFile(tempFile, renderedArticle, (err) => {
                    if (err) {
                        console.error("Error creating temp file:", err)
                        return res.status(500).send('Server error')
                    }

                    res.sendFile(tempFile, () => {
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

// MASTER PAGES //

app.get('/console', (req, res) => {
    const admin = true
    if (!(admin === true)) {
        return res.redirect('/')
    } else {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console.html'))
    }
})

app.get('/console/:sect', (req, res) => {
    const admin = true
    const sect = req.params.sect
    if (!(admin === true)) {
        return res.redirect('/')
    } else if (sect == 'listings') {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console/listings.html'))
    } else if (sect == 'resources') {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console/resources.html'))
    } else if (sect == 'reports') {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console/reports.html'))
    } else if (sect == 'tickets') {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console/tickets.html'))
    } else if (sect == 'accounts') {
        res.sendFile(path.join(__dirname, '../backend/templates/master/console/accounts.html'))
    } else {
        return res.redirect('/console')
    }
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
        console.log(listinginfo)

        if (listinginfo.approved == true) {
            return res.status(404).send('Listing already approved')
        }

        console.log(listinginfo.location)
        const response = await fetch(`https://api.zippopotam.us/us/${listinginfo.location}`)

        if(!response.ok) {
            console.error('Error fetching place:', response)
            return res.status(500).send('Server error')
        }

        const data = await response.json()
        console.log(data)

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

// FUNCTIONS //

app.post('/search', async (req, res) => {
    console.log(`NEW /search POST request from ${req.ip}`)
    const tags = req.body.tags
    console.log(tags)
    try {
        let result

        if (tags.length == 0) {
            result = await pool.query('SELECT * from listings WHERE approved = true')
            console.log(`Found ${result.rows.length} unfiltered results matching tags, sending to viewer`)
        } else {
            const result = await pool.query('SELECT * from listings WHERE tags @> $1::TEXT[]', [tags])
            console.log(`Found ${result.rows.length} results matching tags, sending to viewer`)
        }
        
        const listings = await Promise.all(result.rows.map(async (listing) => {
            try {
                const response = await fetch(`https://api.zippopotam.us/us/${listing.location}`)

                if (!response.ok) {
                    console.error(`Error fetching place for zip code ${listing.location}:`, response)
                    return {
                        ...listing,
                        location: 'N/A'
                    }
                }

                const data = await response.json();
                const city = data.places[0]['place name'];
                const state = data.places[0]['state abbreviation'];
                const formattedCity = `${city}, ${state}`;

                return {
                    ...listing,
                    location: formattedCity
                }
            } catch (error) {
                console.error(`Error fetching location for zipcode ${listing.location}:`, error)
                return {
                    ...listing,
                    location: 'N/A'
                }
            }
        }))

        return res.status(200).json({ listings: listings })
    } catch (error) {
        console.error('Error fetching items:', error)
    }
})

app.post('/searchraw', async (req, res) => {
    console.log(`NEW /searchraw POST request from ${req.ip}`)
    try {
        const result = await pool.query('SELECT * from listings WHERE approved = false')
        console.log(`Found ${result.rows.length} unfiltered results that need to be reviewed, sending to counselor`)
        
        const listings = await Promise.all(result.rows.map(async (listing) => {
            try {
                const response = await fetch(`https://api.zippopotam.us/us/${listing.location}`)

                if (!response.ok) {
                    console.error(`Error fetching place for zip code ${listing.location}:`, response)
                    return {
                        ...listing,
                        location: 'N/A'
                    }
                }

                const data = await response.json();
                const city = data.places[0]['place name'];
                const state = data.places[0]['state abbreviation'];
                const formattedCity = `${city}, ${state}`;

                return {
                    ...listing,
                    location: formattedCity
                }
            } catch (error) {
                console.error(`Error fetching location for zipcode ${listing.location}:`, error)
                return {
                    ...listing,
                    location: 'N/A'
                }
            }
        }))

        return res.status(200).json({ listings: listings })
    } catch (error) {
        console.error('Error fetching items:', error)
    }
})

// ROUTES //

app.post('/login', async (req, res) => {
    const { email, password } = req.body
    try {
        const result = await pool.query('SELECT * from users WHERE email = $1', [email])
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Form Body', error: 'Invalid credentials.' })
        }
        const user = result.rows[0]
        const validPassword = await bcrypt.compare(password, user.password)

        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid Form Body', error: 'Invalid credentials.' })
        }
        res.status(200).json({ id: user.id, settings: user.settings })
    } catch (error) {
        console.log(`Error trying to run /login route: ${error}`)
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/post', async (req, res) => {
    console.log(`NEW /post POST request from ${req.ip}`)
    const { name, icon, location, salary, description, arrangements, requirements, skills, responsibilities, benefits } = req.body
    try {
        const query = await pool.query('INSERT INTO listings (name, employer, icon, location, salary, arrangements, description, requirements, skills, responsibilities, benefits, created) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
                                               [name, 1, icon, location, salary, arrangements, description, requirements, skills, responsibilities, benefits, Math.floor(Date.now() / 1000)])
        res.status(201).json({ id: query.rows[0].id })
    } catch (error) {
        const ip = req.ip
        console.log(`[${ip}] ERROR (/register): ${error}`)
        res.status(500).json({ error: `Server error` })
    }
})

// INITIALIZER //

app.listen(port, () => {
    console.log(`[CONSOLE] Server running on http://localhost:${port}`)
})