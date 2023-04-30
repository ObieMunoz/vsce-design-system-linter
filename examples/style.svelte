<script>
  export let title = "My Page Title";
  export let subtitle = "Welcome to my page!";
</script>

<main>
  <h1>{title}</h1>
  <p>{subtitle}</p>
  <img src="https://via.placeholder.com/500" alt="Placeholder" />
</main>

<style>
  /* Reset styles */
  *,
  *::before,
  *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* Page styles */
  main {
    padding: 20px;
    width: 80%;
    margin: 0 auto;
  }

  h1 {
    font-size: 36px;
    margin-bottom: 10px;
  }

  p {
    font-size: 18px;
    margin-bottom: 20px;
  }

  img {
    max-width: 100%;
    height: auto;
    margin-bottom: 20px;
  }

  /* Colors */
  h1 {
    color: #f2f2f2;
  }

  p {
    color: #666;
  }
</style>
