// The scrape → map pipeline, shared by the flyer panel and the admin panel.
export const PIPELINE_STEPS = [
  {
    icon: '📸',
    done: 'Scraped from Instagram',
    active: 'Scraping',
    via: 'Bright Data',
  },
  { icon: '🗄️', done: 'Stored', active: 'Storing', via: 'Vultr Object Storage' },
  {
    icon: '🤖',
    done: 'Read by AI',
    active: 'Reading flyers',
    via: 'Vultr Serverless Inference',
  },
  {
    icon: '📍',
    done: 'Matched to building',
    active: 'Saving',
    via: 'Neon Postgres',
  },
]
