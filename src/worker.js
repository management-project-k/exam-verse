/**
 * Cloudflare Worker with D1 Database Connection
 * Database Binding: EXAMVERSE_DB
 */

export default {
  async fetch(request, env) {
    try {
      // Get the D1 database binding
      const db = env.EXAMVERSE_DB;
      
      // Parse the request URL
      const url = new URL(request.url);
      const path = url.pathname;
      
      // Example: GET /api/students - fetch all students
      if (path === '/api/students' && request.method === 'GET') {
        const result = await db.prepare('SELECT * FROM students LIMIT 10').all();
        return new Response(JSON.stringify({
          success: true,
          data: result.results,
          message: 'Connected to D1 database successfully!'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }
      
      // Health check endpoint
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          database: 'connected',
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }
      
      // Default response
      return new Response(JSON.stringify({
        message: 'Exam-Verse API with D1 Database',
        endpoints: [
          'GET /api/students - Fetch students',
          'GET /health - Health check'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }
};
