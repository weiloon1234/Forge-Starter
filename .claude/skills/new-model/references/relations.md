# Reference: Relation patterns

Read this from the `new-model` skill when declaring any relation beyond a plain `belongs_to`. The starter uses **hand-written relation methods** — no `#[forge(belongs_to = ...)]` attribute exists. Each relation is a `pub fn` on the model's `impl` block returning a `RelationDef<Self, Target>`.

Forge provides three helper functions: `belongs_to`, `has_one`, `has_many`. They all live in `forge::prelude`.

## Shape every relation method follows

```rust
impl <Model> {
    pub fn <relation_name>() -> RelationDef<Self, <Target>> {
        <helper_fn>(
            <local_key_column>,
            <remote_key_column>,
            |row| <extract_local_key>,
            |row, loaded| <assign_loaded_field>,
        )
        .named("<relation_name>")
    }
}
```

Four inputs to every helper:

1. **Local key column** — `Self::<FK_COLUMN>` or `Self::ID` (typed column constant)
2. **Remote key column** — `<Target>::<FIELD>` or `<Target>::ID`
3. **Extractor closure** — given `&Self`, return the key value (the shape of this differs per helper)
4. **Assigner closure** — given `&mut Self` and the loaded target, store into the `Loaded<...>` field

The `.named("name")` at the end labels the relation for `.with()` joins — usually matches the method name.

Each relation requires a matching field on the struct:

```rust
#[serde(skip)]
pub <relation_name>: Loaded<Option<<Target>>>,     // belongs_to, has_one
#[serde(skip)]
pub <relation_name>: Loaded<Vec<<Target>>>,        // has_many
#[serde(skip)]
pub <relation_name>: Loaded<Option<Box<Self>>>,    // self-reference belongs_to
```

`#[serde(skip)]` is mandatory — relations are not serialized. If you need related data in a response, load it explicitly and put it in a dedicated response DTO.

## `belongs_to` — "this model has an FK to another model"

Most common. Use when your model carries the FK.

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::User;

#[derive(Serialize, forge::Model)]
#[forge(model = "posts")]
pub struct Post {
    pub id: ModelId<Self>,
    pub author_id: ModelId<User>,
    pub title: String,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    #[serde(skip)]
    pub author: Loaded<Option<User>>,
}

impl Post {
    pub fn author() -> RelationDef<Self, User> {
        belongs_to(
            Self::AUTHOR_ID,
            User::ID,
            |post| Some(post.author_id),
            |post, user| post.author = Loaded::new(user),
        )
        .named("author")
    }
}
```

The extractor closure returns `Option<Key>`. For non-null FKs (`author_id: ModelId<User>`), always wrap in `Some(...)`. For nullable FKs, return the inner `Option` directly — see below.

### Nullable FK variant

```rust
pub struct Comment {
    pub id: ModelId<Self>,
    pub author_id: Option<ModelId<User>>,
    // ...
    #[serde(skip)]
    pub author: Loaded<Option<User>>,
}

impl Comment {
    pub fn author() -> RelationDef<Self, User> {
        belongs_to(
            Self::AUTHOR_ID,
            User::ID,
            |comment| comment.author_id,   // already Option<ModelId<User>>
            |comment, user| comment.author = Loaded::new(user),
        )
        .named("author")
    }
}
```

### FK to a model with manual String PK (Country-style)

```rust
use crate::domain::models::Country;

pub struct Invoice {
    pub id: ModelId<Self>,
    pub country_iso2: Option<String>,   // matches Country::iso2 type
    // ...
    #[serde(skip)]
    pub country: Loaded<Option<Country>>,
}

impl Invoice {
    pub fn country() -> RelationDef<Self, Country> {
        let foreign_key: Column<Self, String> =
            Column::new("invoices", "country_iso2", DbType::Text);
        belongs_to(
            foreign_key,
            Country::ISO2,
            |invoice| invoice.country_iso2.clone(),
            |invoice, country| invoice.country = Loaded::new(country),
        )
        .named("country")
    }
}
```

Note the explicit `Column::new(...)` — when the FK type is `String` (not `ModelId<T>`), the column constant has a different shape and you construct it manually. See `User::country()` in `src/domain/models/user.rs` for the precedent.

### Self-reference `belongs_to`

A row that points at another row of the same table (user's introducer, comment's parent, category's parent). The loaded field needs `Box` because Rust can't have a recursive non-indirected type:

```rust
pub struct Comment {
    pub id: ModelId<Self>,
    pub parent_comment_id: Option<ModelId<Self>>,
    // ...
    #[serde(skip)]
    pub parent: Loaded<Option<Box<Comment>>>,   // Box breaks the cycle
}

impl Comment {
    pub fn parent() -> RelationDef<Self, Self> {
        let foreign_key: Column<Self, ModelId<Self>> =
            Column::new("comments", "parent_comment_id", DbType::Uuid);
        belongs_to(
            foreign_key,
            Self::ID,
            |comment| comment.parent_comment_id,
            |comment, parent| comment.parent = Loaded::new(parent.map(Box::new)),
        )
        .named("parent")
    }
}
```

See `User::introducer()` in `src/domain/models/user.rs` for the real-world pattern.

## `has_one` — "another model has an FK to this model; there's exactly one"

Use when the FK lives on the *other* model and the relationship is 1:1 or 1:0-or-1.

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::UserProfile;

#[derive(Serialize, forge::Model)]
#[forge(model = "users", soft_deletes = true)]
pub struct User {
    pub id: ModelId<Self>,
    // ...
    #[serde(skip)]
    pub profile: Loaded<Option<UserProfile>>,
}

impl User {
    pub fn profile() -> RelationDef<Self, UserProfile> {
        has_one(
            Self::ID,
            UserProfile::USER_ID,
            |user| user.id,
            |user, profile| user.profile = Loaded::new(profile),
        )
    }
}
```

Key shape difference from `belongs_to`:

- The extractor returns `Key` directly (not `Option<Key>`) — a model always has its own ID, never null.
- The first argument is the **local key** (`Self::ID`), second is the **remote key** (the FK on the other model).

### Filtered `has_one` — translations, localized content

When the relation has additional filter predicates, chain `.where_(...)` on the `RelationDef`:

```rust
impl Page {
    pub fn title_translation(locale: &str) -> RelationDef<Self, PageTranslation> {
        has_one(
            Self::ID,
            PageTranslation::TRANSLATABLE_ID,
            |page| page.id,
            |page, translation| page.title_translation = Loaded::new(translation),
        )
        .where_(PageTranslation::TRANSLATABLE_TYPE.eq(Self::translatable_type()))
        .where_(PageTranslation::LOCALE.eq(locale))
        .where_(PageTranslation::FIELD.eq("title"))
    }
}
```

The relation method takes arguments (`locale: &str`) and the returned `RelationDef` carries them into the join clause. See `Page::title_translation` in `src/domain/models/page.rs`.

## `has_many` — "another model has an FK to this model; there are zero or more"

```rust
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::Post;

#[derive(Serialize, forge::Model)]
#[forge(model = "users", soft_deletes = true)]
pub struct User {
    pub id: ModelId<Self>,
    // ...
    #[serde(skip)]
    pub posts: Loaded<Vec<Post>>,   // Vec, not Option
}

impl User {
    pub fn posts() -> RelationDef<Self, Post> {
        has_many(
            Self::ID,
            Post::AUTHOR_ID,
            |user| user.id,
            |user, posts| user.posts = Loaded::new(posts),
        )
    }
}
```

Differences from `has_one`:

- The `Loaded<...>` field is `Loaded<Vec<Target>>` (not `Loaded<Option<Target>>`).
- The assigner receives `Vec<Target>` directly (not `Option<Target>`).

### Scoped `has_many` — active-only, ordered

Chain `.where_(...)` and `.order_by(...)` to narrow or sort:

```rust
impl User {
    pub fn active_posts() -> RelationDef<Self, Post> {
        has_many(
            Self::ID,
            Post::AUTHOR_ID,
            |user| user.id,
            |user, posts| user.active_posts = Loaded::new(posts),
        )
        .where_(Post::DELETED_AT.is_null())
        .order_by(Post::CREATED_AT.desc())
    }
}
```

## Loading relations at query time

Relations are lazily loaded — the `Loaded<T>` field is empty until explicitly filled. Trigger loading with `.with(Model::relation_name())` on a query:

```rust
let user_with_posts = User::model_query()
    .where_eq(User::ID, user_id)
    .with(User::posts())
    .first(&*db)
    .await?;

if let Some(user) = user_with_posts {
    for post in user.posts.as_ref().unwrap_or(&vec![]) {
        println!("{}", post.title);
    }
}
```

Multiple relations on the same query:

```rust
let comment = Comment::model_query()
    .where_eq(Comment::ID, comment_id)
    .with(Comment::author())
    .with(Comment::parent())
    .first(&*db)
    .await?;
```

Do not manually write JOIN SQL in service code when a declared relation + `.with()` covers it. Reach for raw joins only when the shape requires projection-row-with-SELECT-list control — in which case you're in datatable-projection territory, not model-relation territory.

## Polymorphic relations

Use when a single FK column can reference rows across multiple tables (one attachment table covers pages, users, products, etc.). This is a separate topic handled by `HasTranslations` / `HasAttachments` traits and a phantom `ModelId<K>` pattern. Read `./polymorphic-fk.md`.

## Don't

- **Don't add `#[forge(belongs_to = ...)]`, `#[forge(has_many = ...)]`, etc.** — those attributes do not exist in this Forge version. Hand-writing the `impl Model { pub fn relation() }` method is the idiomatic approach, not a workaround.
- **Don't serialize relation fields.** Every `Loaded<T>` field is `#[serde(skip)]`. If a response needs related data, load it in the service and build a dedicated response DTO.
- **Don't forget `Box` on self-referencing `Loaded<Option<Self>>`.** Rust rejects recursive non-indirected types. Use `Loaded<Option<Box<Self>>>` and wrap with `.map(Box::new)` in the assigner.
- **Don't mismatch key column types.** The local key and remote key columns must have the same underlying type — `ModelId<T>` + `ModelId<T>`, or `String` + `String`, etc. A mismatch compiles on the struct but fails at query build time.
- **Don't name the method and the field differently** without reason. Convention: same name (`.author()` method loads into `.author` field). Divergence confuses future readers.

## Real-world references in the starter

- `belongs_to` (non-null FK): `CreditTransaction::user()` — `src/domain/models/credit_transaction.rs`
- `belongs_to` (nullable FK): `User::introducer()` — `src/domain/models/user.rs`
- `belongs_to` (manual String PK): `User::country()`, `User::contact_country()` — `src/domain/models/user.rs`
- `belongs_to` (self-reference): `User::introducer()` is also the canonical self-reference
- `has_one` (filtered): `Page::title_translation(locale)` — `src/domain/models/page.rs`
- `has_many`: none in the current starter — add yours and this list grows.

When adding a new relation, skim the closest existing example in the starter and mirror its shape.
