/**
 * Sanity CMS Client for Emily's Pet Heaven
 * This file handles all communication with the Sanity CMS backend
 */

const SANITY_CONFIG = {
  projectId: 'kxhc14m8',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true // Use CDN for faster responses (set to false for real-time data)
};

/**
 * Build Sanity API URL
 */
function buildSanityUrl(query, params = {}) {
  const baseUrl = `https://${SANITY_CONFIG.projectId}.api.sanity.io/v${SANITY_CONFIG.apiVersion}/data/query/${SANITY_CONFIG.dataset}`;
  const encodedQuery = encodeURIComponent(query);
  let url = `${baseUrl}?query=${encodedQuery}`;
  
  // Add parameters
  Object.keys(params).forEach(key => {
    url += `&$${key}="${encodeURIComponent(params[key])}"`;
  });
  
  return url;
}

/**
 * Build image URL from Sanity image reference
 */
function buildImageUrl(imageRef, options = {}) {
  if (!imageRef || !imageRef.asset || !imageRef.asset._ref) {
    return '/images/placeholder-blog.jpg';
  }
  
  const ref = imageRef.asset._ref;
  // Parse the reference: image-{id}-{dimensions}-{format}
  const [, id, dimensions, format] = ref.split('-');
  
  let url = `https://cdn.sanity.io/images/${SANITY_CONFIG.projectId}/${SANITY_CONFIG.dataset}/${id}-${dimensions}.${format}`;
  
  // Add image transformations
  const transforms = [];
  if (options.width) transforms.push(`w=${options.width}`);
  if (options.height) transforms.push(`h=${options.height}`);
  if (options.quality) transforms.push(`q=${options.quality}`);
  if (options.fit) transforms.push(`fit=${options.fit}`);
  
  if (transforms.length > 0) {
    url += '?' + transforms.join('&');
  }
  
  return url;
}

/**
 * Fetch all published blog posts
 */
async function fetchBlogPosts(limit = 10, offset = 0) {
  const query = `*[_type == "blogPost" && status == "published"] | order(publishedAt desc) [${offset}...${offset + limit}] {
    _id,
    title,
    slug,
    excerpt,
    featuredImage,
    publishedAt,
    "author": author->name,
    "authorImage": author->image,
    "category": category->title,
    "categorySlug": category->slug.current,
    language
  }`;
  
  try {
    const response = await fetch(buildSanityUrl(query));
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }
}

/**
 * Fetch a single blog post by slug
 */
async function fetchBlogPostBySlug(slug) {
  const query = `*[_type == "blogPost" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    excerpt,
    body,
    featuredImage,
    metaTitle,
    metaDescription,
    focusKeyword,
    keywords,
    publishedAt,
    "author": author->{name, bio, image, role},
    "category": category->{title, slug, description},
    language,
    socialMedia
  }`;
  
  try {
    const url = buildSanityUrl(query, { slug });
    const response = await fetch(url);
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
}

/**
 * Fetch blog posts by category
 */
async function fetchBlogPostsByCategory(categorySlug, limit = 10) {
  const query = `*[_type == "blogPost" && status == "published" && category->slug.current == $categorySlug] | order(publishedAt desc) [0...${limit}] {
    _id,
    title,
    slug,
    excerpt,
    featuredImage,
    publishedAt,
    "author": author->name,
    "category": category->title
  }`;
  
  try {
    const url = buildSanityUrl(query, { categorySlug });
    const response = await fetch(url);
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Error fetching blog posts by category:', error);
    return [];
  }
}

/**
 * Fetch all categories
 */
async function fetchCategories() {
  const query = `*[_type == "category"] | order(title asc) {
    _id,
    title,
    slug,
    description,
    icon,
    "postCount": count(*[_type == "blogPost" && references(^._id) && status == "published"])
  }`;
  
  try {
    const response = await fetch(buildSanityUrl(query));
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * Fetch recent posts for sidebar
 */
async function fetchRecentPosts(limit = 5) {
  const query = `*[_type == "blogPost" && status == "published"] | order(publishedAt desc) [0...${limit}] {
    _id,
    title,
    slug,
    featuredImage,
    publishedAt
  }`;
  
  try {
    const response = await fetch(buildSanityUrl(query));
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Error fetching recent posts:', error);
    return [];
  }
}

/**
 * Convert Portable Text to HTML
 */
function portableTextToHtml(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  
  return blocks.map(block => {
    if (block._type === 'block') {
      const style = block.style || 'normal';
      let text = '';
      
      if (block.children) {
        text = block.children.map(child => {
          let content = child.text || '';
          
          // Apply marks
          if (child.marks && child.marks.length > 0) {
            child.marks.forEach(mark => {
              if (mark === 'strong') content = `<strong>${content}</strong>`;
              if (mark === 'em') content = `<em>${content}</em>`;
              if (mark === 'underline') content = `<u>${content}</u>`;
            });
          }
          
          return content;
        }).join('');
      }
      
      // Apply block styles
      switch (style) {
        case 'h2': return `<h2>${text}</h2>`;
        case 'h3': return `<h3>${text}</h3>`;
        case 'h4': return `<h4>${text}</h4>`;
        case 'blockquote': return `<blockquote>${text}</blockquote>`;
        default: return `<p>${text}</p>`;
      }
    }
    
    if (block._type === 'image') {
      const imageUrl = buildImageUrl(block, { width: 800, quality: 80 });
      const alt = block.alt || 'Blog image';
      const caption = block.caption ? `<figcaption>${block.caption}</figcaption>` : '';
      return `<figure><img src="${imageUrl}" alt="${alt}" loading="lazy">${caption}</figure>`;
    }
    
    return '';
  }).join('\n');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Get total post count
 */
async function getTotalPostCount() {
  const query = `count(*[_type == "blogPost" && status == "published"])`;
  
  try {
    const response = await fetch(buildSanityUrl(query));
    const data = await response.json();
    return data.result || 0;
  } catch (error) {
    console.error('Error getting post count:', error);
    return 0;
  }
}

// Export functions for use in other scripts
window.SanityClient = {
  fetchBlogPosts,
  fetchBlogPostBySlug,
  fetchBlogPostsByCategory,
  fetchCategories,
  fetchRecentPosts,
  buildImageUrl,
  portableTextToHtml,
  formatDate,
  getTotalPostCount
};
