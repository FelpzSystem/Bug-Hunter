export function render(userInput) {
  const box = document.querySelector('#app');
  box.innerHTML = userInput;
  document.write(userInput);
  setTimeout('refresh()', 1000);
  return box;
}
