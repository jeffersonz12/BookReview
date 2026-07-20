# Book Review
A project that allows teachers (admins) to create classes, assign books, grade reviews, and moderate stuff. Allows students to read write reviews.

## Project Structure
### File Tree
```
├─ README.md
├─ package.json
├─ .npmrc
└─ artifacts
    ├─ api-server
    │   ├─ models.js
    │   ├─ server.js
    │   └─ routes
    │       ├─ admin.js
    │       ├─ assignments.js
    │       ├─ auth.js
    │       ├─ books.js
    │       ├─ classes.js
    │       ├─ notifications.js
    │       └─ reviews.js
    │   
    └─ book-reviews
        ├─ index.html
        ├─ styles.css
        └─ js
            ├─ api.js
            ├─ app.js
            └─ pages
                ├─ admin.js
                ├─ auth.js
                ├─ book-detail.js
                ├─ catalog.js
                ├─ classes.js
                └─ profile.js
```

### Key Components
- `artifacts/api-server/`: The Node.js/Express backend handling data models, authentication, and API routing.
- `artifacts/book-reviews/`: The frontend user interface, seperated cleanly by page logic and style definitions

## Setup
### Environment Variables
`MONGODB_URI`: MongoDB Connection String `mongodb+srv://`
`SESSION_SECRET`: Secret Key used to persist user sign-ins across server restarts

### Usage
- Install Dependencies: `npm install`
- Start Server: `node artifacts/api-server/server.js`

## Limitations
- No SSO (didn't want to deal with it)
- No password reset function
- May be difficult to find user's reviews if there are too many
- Can't search and add reviews to books not explicitly added to the catalog (The required function is already implemented, forgot to change ui)

***
> I apologize for the lack of comments in my program, however, everything is appropriately named, and if you have even the slightest bit of reasoning, you should be easily able to identify everything. Thank you.