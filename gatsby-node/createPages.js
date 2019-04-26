const {
  compose,
  sort,
  tail,
  comparator,
  split,
  map,
  keys,
  invertObj,
  forEach,
  forEachObjIndexed,
  last,
} = require('ramda');
const {
  templatePaths,
  listTemplatePathByCategory,
  pageTemplatePathByCategory,
} = require('./constants');

module.exports = async ({graphql, actions: {createPage}}) => {
  const {errors, data} = await graphql(`
    {
      posts: allMarkdownRemark(filter: {fields: {category: {eq: "posts"}}}) {
        edges {
          node {
            frontmatter {
              tags
              href
            }
            fields {
              slug
              date
            }
          }
        }
      }

      events: allMarkdownRemark(filter: {fields: {category: {eq: "events"}}}) {
        edges {
          node {
            frontmatter {
              tags
              href
            }
            fields {
              slug
              date
            }
          }
        }
      }

      contributors: allMarkdownRemark(
        filter: {fields: {category: {eq: "contributors"}}}
      ) {
        edges {
          node {
            fields {
              id
              slug
            }
          }
        }
      }

      newsletters: allMarkdownRemark(
        filter: {fields: {category: {eq: "newsletters"}}}
      ) {
        edges {
          node {
            fields {
              slug
              date
            }
          }
        }
      }
    }
  `);

  if (errors) throw errors;

  const currentDate = new Date().toJSON();

  createPage({
    path: '/',
    component: templatePaths.landing,
    context: {currentDate},
  });

  const existenceByTag = {};
  // {[slug]: {events: {[date]: true}}}
  const dateExistenceByCategoryBySlug = {};

  const getSlug = (date, weeksToSubtract) => {
    if (weeksToSubtract) date.setDate(date.getDate() - 7 * weeksToSubtract);
    const year = date.getFullYear();
    const week = date.getMonth() * 4 + Math.floor(date.getDate() / 7) + 1;
    return `newsletters/${year}/${week}`;
  };

  forEachObjIndexed(({edges}, category) => {
    forEach(({node}) => {
      const {fields, frontmatter = {}} = node;
      const {date: stringifiedDate, slug} = fields;
      const {tags, href} = frontmatter;

      // get list of all tags
      tags &&
        tags.forEach(tag => {
          existenceByTag[tag] = true;
        });

      // CLEAN THIS UP!
      if (stringifiedDate) {
        const date = new Date(stringifiedDate);

        if (category === 'events') {
          [1, 2, 3, 4].forEach(n => {
            const s = getSlug(date, n);

            if (!dateExistenceByCategoryBySlug[s]) {
              dateExistenceByCategoryBySlug[s] = {
                events: {},
                posts: {},
                newsletters: {},
              };
            }
            dateExistenceByCategoryBySlug[s].events[stringifiedDate] = true;
          });
        } else {
          const s = getSlug(date);

          if (!dateExistenceByCategoryBySlug[s]) {
            dateExistenceByCategoryBySlug[s] = {
              events: {},
              posts: {},
              newsletters: {},
            };
          }
          dateExistenceByCategoryBySlug[s][category][stringifiedDate] = true;
        }
      }

      // create post, event and contributor pages
      // (don't create for externals)
      category === 'contributors' &&
        !href &&
        createPage({
          path: slug,
          component: pageTemplatePathByCategory[category],
          context: fields,
        });
    }, edges);
  }, data);

  const newsletterSlugs = keys(dateExistenceByCategoryBySlug);

  const getComparableValuesFromSlug = map(
    compose(
      map(parseInt),
      tail,
      split('/'),
    ),
  );

  const compareSlugs = comparator((a, b) => {
    const [[yearA, weekA], [yearB, weekB]] = getComparableValuesFromSlug([
      a,
      b,
    ]);
    return yearA === yearB ? weekA > weekB : yearA > yearB;
  });

  const sortedNewsletterSlugs = sort(compareSlugs, newsletterSlugs);
  const indexByNewsletterSlug = map(parseInt, invertObj(sortedNewsletterSlugs));

  createPage({
    path: 'newsletters',
    component: listTemplatePathByCategory.newsletters,
    context: {
      sortedSlugs: sortedNewsletterSlugs,
      indexBySlug: JSON.stringify(indexByNewsletterSlug),
      latestSlug: sortedNewsletterSlugs[0],
    },
  });

  // create newsletter pages
  forEachObjIndexed((datesByCategory, slug) => {
    const week = last(split('/', slug));
    const i = indexByNewsletterSlug[slug];
    const next = sortedNewsletterSlugs[i - 1];
    const previous = sortedNewsletterSlugs[i + 1];

    createPage({
      path: slug,
      component: templatePaths.newsletter,
      context: {
        current: `/${slug}`,
        next,
        previous,
        week,
        ...map(keys, datesByCategory),
      },
    });
  }, dateExistenceByCategoryBySlug);

  createPage({
    path: 'contributors',
    component: listTemplatePathByCategory.contributors,
  });

  createPage({
    path: 'events',
    component: listTemplatePathByCategory.events,
    context: {currentDate},
  });

  createPage({
    path: 'posts',
    component: listTemplatePathByCategory.posts,
  });
};