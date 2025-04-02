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

app.use('../static', express.static(path.join(__dirname, '../frontend/static')))

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


app.get('/listings/:id', async (req, res) => {
    const id = req.params.id
    console.log(`Someone tried view portfolio with ID: ${id}`)

    try {

    } catch (err) {
        console.error('Database error:', err)
        res.status(500).send('Server error')
    }
})

// MASTER PAGES //

app.get('/console', (req, res) => {
    res.sendFile(path.join(__dirname, '../backend/master/console.html'))
})

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, '../backend/master/panel.html'))
})

// FUNCTIONS //

app.post('/search', async (req) => {
    const tags = req.body
    try {
        const result = await pool.query('SELECT * from listings WHERE tags @> $1::TEXT[]')
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

// INITIALIZER //

app.listen(port, () => {
    console.log(`[CONSOLE] Server running on http://localhost:${port}`)
})