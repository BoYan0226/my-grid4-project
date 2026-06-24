const loginForm = document.querySelector('.login-form');
const phoneInput = document.querySelector('#login-phone');
const phoneMessage = document.querySelector('#phone-message');
const codeButton = document.querySelector('.login-form__submit');

if (loginForm && phoneInput && phoneMessage && codeButton) {
	let countdownTimer = null;

	const isValidPhone = (value) => /^1\d{10}$/.test(value);

	phoneInput.addEventListener('input', () => {
		phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
		phoneMessage.textContent = '';
	});

	loginForm.addEventListener('submit', (event) => {
		event.preventDefault();

		if (!isValidPhone(phoneInput.value)) {
			phoneMessage.textContent = '请输入正确的 11 位手机号码';
			phoneInput.focus();
			return;
		}

		let seconds = 60;
		codeButton.disabled = true;
		codeButton.firstElementChild.textContent = `${seconds} 秒后重新获取`;

		clearInterval(countdownTimer);
		countdownTimer = setInterval(() => {
			seconds -= 1;

			if (seconds <= 0) {
				clearInterval(countdownTimer);
				codeButton.disabled = false;
				codeButton.firstElementChild.textContent = '获取验证码';
				return;
			}

			codeButton.firstElementChild.textContent = `${seconds} 秒后重新获取`;
		}, 1000);
	});
}
