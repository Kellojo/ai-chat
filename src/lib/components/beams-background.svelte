<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils.js';

	interface Beam {
		x: number;
		y: number;
		width: number;
		length: number;
		angle: number;
		speed: number;
		opacity: number;
		hue: number;
		pulse: number;
		pulseSpeed: number;
	}

	interface Props {
		intensity?: 'subtle' | 'medium' | 'strong';
		class?: string;
	}

	let { intensity = 'strong', class: className }: Props = $props();

	let canvas: HTMLCanvasElement;

	const opacityMap = {
		subtle: 0.7,
		medium: 0.85,
		strong: 1
	};

	function createBeam(width: number, height: number, isDarkMode: boolean): Beam {
		const angle = -35 + Math.random() * 10;
		const hueBase = isDarkMode ? 190 : 210;
		const hueRange = isDarkMode ? 70 : 50;

		return {
			x: Math.random() * width * 1.5 - width * 0.25,
			y: Math.random() * height * 1.5 - height * 0.25,
			width: 30 + Math.random() * 60,
			length: height * 2.5,
			angle,
			speed: 0.6 + Math.random() * 1.2,
			opacity: 0.12 + Math.random() * 0.16,
			hue: hueBase + Math.random() * hueRange,
			pulse: Math.random() * Math.PI * 2,
			pulseSpeed: 0.02 + Math.random() * 0.03
		};
	}

	onMount(() => {
		const context = canvas.getContext('2d');
		if (!context) return;
		const ctx: CanvasRenderingContext2D = context;

		const MINIMUM_BEAMS = 20;
		let beams: Beam[] = [];
		let animationFrame = 0;
		let isDarkMode = false;

		const updateDarkMode = () => {
			isDarkMode = document.documentElement.classList.contains('dark');
		};

		const observer = new MutationObserver(updateDarkMode);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
		updateDarkMode();

		const updateCanvasSize = () => {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = window.innerWidth * dpr;
			canvas.height = window.innerHeight * dpr;
			canvas.style.width = `${window.innerWidth}px`;
			canvas.style.height = `${window.innerHeight}px`;
			ctx.scale(dpr, dpr);

			const totalBeams = MINIMUM_BEAMS * 1.5;
			beams = Array.from({ length: totalBeams }, () =>
				createBeam(canvas.width, canvas.height, isDarkMode)
			);
		};

		updateCanvasSize();
		window.addEventListener('resize', updateCanvasSize);

		function resetBeam(beam: Beam, index: number, totalBeams: number) {
			const column = index % 3;
			const spacing = canvas.width / 3;

			const hueBase = isDarkMode ? 190 : 210;
			const hueRange = isDarkMode ? 70 : 50;

			beam.y = canvas.height + 100;
			beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
			beam.width = 100 + Math.random() * 100;
			beam.speed = 0.5 + Math.random() * 0.4;
			beam.hue = hueBase + (index * hueRange) / totalBeams;
			beam.opacity = 0.2 + Math.random() * 0.1;
		}

		function drawBeam(ctx: CanvasRenderingContext2D, beam: Beam) {
			ctx.save();
			ctx.translate(beam.x, beam.y);
			ctx.rotate((beam.angle * Math.PI) / 180);

			const pulsingOpacity =
				beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[intensity];

			const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);

			const saturation = isDarkMode ? '85%' : '75%';
			const lightness = isDarkMode ? '65%' : '45%';

			gradient.addColorStop(0, `hsla(${beam.hue}, ${saturation}, ${lightness}, 0)`);
			gradient.addColorStop(
				0.1,
				`hsla(${beam.hue}, ${saturation}, ${lightness}, ${pulsingOpacity * 0.5})`
			);
			gradient.addColorStop(
				0.4,
				`hsla(${beam.hue}, ${saturation}, ${lightness}, ${pulsingOpacity})`
			);
			gradient.addColorStop(
				0.6,
				`hsla(${beam.hue}, ${saturation}, ${lightness}, ${pulsingOpacity})`
			);
			gradient.addColorStop(
				0.9,
				`hsla(${beam.hue}, ${saturation}, ${lightness}, ${pulsingOpacity * 0.5})`
			);
			gradient.addColorStop(1, `hsla(${beam.hue}, ${saturation}, ${lightness}, 0)`);

			ctx.fillStyle = gradient;
			ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
			ctx.restore();
		}

		function animate() {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.filter = 'blur(35px)';

			const totalBeams = beams.length;
			beams.forEach((beam, index) => {
				beam.y -= beam.speed;
				beam.pulse += beam.pulseSpeed;

				if (beam.y + beam.length < -100) {
					resetBeam(beam, index, totalBeams);
				}

				drawBeam(ctx, beam);
			});

			animationFrame = requestAnimationFrame(animate);
		}

		animate();

		return () => {
			window.removeEventListener('resize', updateCanvasSize);
			cancelAnimationFrame(animationFrame);
			observer.disconnect();
		};
	});
</script>

<div class={cn('absolute inset-0 overflow-hidden bg-neutral-100 dark:bg-neutral-950', className)}>
	<canvas bind:this={canvas} class="absolute inset-0" style="filter: blur(15px);"></canvas>
	<div class="absolute inset-0 bg-neutral-900/5 backdrop-blur-[50px] dark:bg-neutral-950/5"></div>
</div>
